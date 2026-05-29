import type { Request, Response } from "express";
import axios from "axios";
import { dohHttpAgent, dohHttpsAgent } from "../services/dohService.js";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

const CACHE_MS  = 5 * 60 * 1000;
const MAX_BYTES = 5 * 1024 * 1024;

type CachedImage = { data: Buffer; ct: string; exp: number };

const bufCache  = new Map<string, CachedImage>();
const inFlight  = new Map<string, Promise<{ data: Buffer; ct: string }>>();

// Evict expired cache entries every CACHE_MS to prevent unbounded memory growth
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of bufCache) {
    if (v.exp <= now) bufCache.delete(k);
  }
}, CACHE_MS).unref();

function fetchUpstream(url: string): Promise<{ data: Buffer; ct: string }> {
  const existing = inFlight.get(url);
  if (existing) return existing;

  const req = axios.get<ArrayBuffer>(url, {
    responseType: "arraybuffer",
    timeout: 15000,
    headers: { "User-Agent": UA, Accept: "image/*,*/*" },
    httpAgent:  dohHttpAgent,
    httpsAgent: dohHttpsAgent,
  }).then(r => ({
    data: Buffer.from(r.data),
    ct:   (r.headers["content-type"] as string) || "image/jpeg",
  })).finally(() => inFlight.delete(url));

  inFlight.set(url, req);
  return req;
}

export async function imgHandler(req: Request, res: Response) {
  const url = req.query.url as string;
  if (!url || !/^https?:\/\//i.test(url)) {
    return res.status(400).send();
  }

  // Serve from in-memory buffer cache
  const hit = bufCache.get(url);
  if (hit && hit.exp > Date.now()) {
    res.set("Content-Type", hit.ct);
    res.set("Cache-Control", "public, max-age=86400");
    return res.send(hit.data);
  }

  try {
    const { data, ct } = await fetchUpstream(url);
    // Cache only reasonably-sized images to bound memory usage
    if (data.length < MAX_BYTES) {
      bufCache.set(url, { data, ct, exp: Date.now() + CACHE_MS });
    }
    res.set("Content-Type", ct);
    res.set("Cache-Control", "public, max-age=86400");
    res.send(data);
  } catch {
    res.status(404).send();
  }
}
