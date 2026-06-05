import type { Request, Response } from "express";
import axios from "axios";
import { LRUCache } from "lru-cache";
import { DOH_HTTP_AGENT, DOH_HTTPS_AGENT } from "../services/dohService.js";
import { isPrivateUrl } from "../utils/ipUtils.js";
import { verifyImageSig } from "../utils/imageSign.js";
import { DEFAULT_UA } from "../constants.js";

const IMG_CACHE_TTL_MS = Number(process.env.IMG_CACHE_MS ?? 5 * 60 * 1000);
const MAX_BYTES = Number(process.env.IMG_MAX_BYTES ?? 10 * 1024 * 1024);

const IMG_CACHE_MAX_BYTES = Number(process.env.IMG_CACHE_MAX_BYTES ?? 50 * 1024 * 1024);

const ALLOWED_IMAGE_CT = new Set([
  "image/jpeg", "image/png", "image/webp", "image/gif", "image/avif",
]);

function safeContentType(raw: string): string {
  const base = raw.split(";")[0].trim().toLowerCase();
  return ALLOWED_IMAGE_CT.has(base) ? raw : "image/jpeg";
}

function isValidImageBytes(bytes: Buffer): boolean {
  if (bytes.length < 12) return false;
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return true;
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return true;
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) return true;
  if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
      bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) return true;
  if (bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70) {
    const brand = bytes.slice(8, 12).toString("ascii");
    return brand === "avif" || brand === "avis";
  }
  return false;
}

type CachedImage = { bytes: Buffer; contentType: string };

const BUF_CACHE = new LRUCache<string, CachedImage>({
  maxSize: IMG_CACHE_MAX_BYTES,
  sizeCalculation: (entry) => entry.bytes.length,
  ttl: IMG_CACHE_TTL_MS,
});
const IN_FLIGHT = new Map<string, Promise<{ bytes: Buffer; contentType: string }>>();

const MAX_REDIRECTS = 3;

function fetchUpstream(url: string, referer?: string): Promise<{ bytes: Buffer; contentType: string }> {
  // unique ref values would allow cache-exhaustion via fake referers
  const existing = IN_FLIGHT.get(url);
  if (existing) return existing;

  const headers: Record<string, string> = { "User-Agent": DEFAULT_UA, Accept: "image/*,*/*" };
  if (referer) headers["Referer"] = referer;

  const req = (async () => {
    let currentUrl = url;
    for (let attempt = 0; attempt <= MAX_REDIRECTS; attempt++) {
      const response = await axios.get<ArrayBuffer>(currentUrl, {
        responseType: "arraybuffer",
        timeout: 15000,
        maxRedirects: 0,
        maxContentLength: MAX_BYTES,
        maxBodyLength:    MAX_BYTES,
        headers,
        httpAgent:  DOH_HTTP_AGENT,
        httpsAgent: DOH_HTTPS_AGENT,
        validateStatus: status => (status >= 200 && status < 300) || (status >= 300 && status < 400),
      });
      if (response.status >= 200 && response.status < 300) {
        const bytes = Buffer.from(response.data);
        if (!isValidImageBytes(bytes)) throw new Error("Response is not a valid image");
        return {
          bytes,
          contentType: safeContentType((response.headers["content-type"] as string) || "image/jpeg"),
        };
      }
      if (attempt === MAX_REDIRECTS) throw new Error("Too many redirects");
      const location = (response.headers["location"] as string | undefined) ?? "";
      if (!location) throw new Error("Redirect missing location");
      const next = new URL(location, currentUrl);
      // Re-run the SSRF guard on every redirect hop. A hostile CDN could bounce to an internal host.
      if (next.protocol !== "http:" && next.protocol !== "https:") throw new Error("Redirect to non-HTTP scheme blocked");
      if (isPrivateUrl(next.href)) throw new Error("Redirect to private URL blocked");
      currentUrl = next.href;
    }
    throw new Error("Redirect loop");
  })().finally(() => IN_FLIGHT.delete(url));

  IN_FLIGHT.set(url, req);
  return req;
}

export async function imgHandler(req: Request, res: Response) {
  const url = req.query.url as string;
  const rawRef = req.query.ref as string | undefined;
  const sig = req.query.sig as string | undefined;
  if (!url || !/^https?:\/\//i.test(url)) {
    return res.status(400).send();
  }

  if (isPrivateUrl(url)) {
    return res.status(400).send();
  }

  // Sign-based auth: only URLs our scraper produced carry a valid signature, blocking open-proxy abuse.
  if (!verifyImageSig(url, sig)) {
    return res.status(403).send();
  }

  let referer: string | undefined;
  if (rawRef && rawRef.length <= 512 && /^https?:\/\//i.test(rawRef) && !/[\r\n]/.test(rawRef)) {
    referer = rawRef;
  } else {
    try { referer = new URL(url).origin + "/"; } catch {}
  }

  const hit = BUF_CACHE.get(url);
  if (hit) {
    res.set("Content-Type", hit.contentType);
    res.set("Cache-Control", "public, max-age=86400");
    res.set("X-Content-Type-Options", "nosniff");
    res.set("Content-Security-Policy", "default-src 'none'");
    return res.send(hit.bytes);
  }

  try {
    const { bytes, contentType } = await fetchUpstream(url, referer);
    if (bytes.length < MAX_BYTES) {
      BUF_CACHE.set(url, { bytes, contentType });
    }
    res.set("Content-Type", contentType);
    res.set("Cache-Control", "public, max-age=86400");
    res.set("X-Content-Type-Options", "nosniff");
    res.set("Content-Security-Policy", "default-src 'none'");
    res.send(bytes);
  } catch {
    res.status(404).send();
  }
}
