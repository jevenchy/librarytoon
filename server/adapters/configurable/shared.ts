import type { Page, SourceConfig } from "../../../shared/types.js";

import type { FetchOptions } from "../../services/fetchService.js";

export function slug(href: string): string {
  return href.replace(/[?#].*$/, "").replace(/\/$/, "").split("/").at(-1) ?? "";
}

export function fixUrl(src: string, base: string, cfg?: SourceConfig): string {
  if (!src) return "";
  if (src.startsWith("http")) return src;
  if (src.startsWith("//")) return `https:${src}`;
  const host = (cfg?.imageCdn || base).replace(/\/$/, "");
  if (src.startsWith("/")) return host + src;
  return src;
}

export function makeHeaders(cfg: SourceConfig, isImage = false) {
  const ua = cfg.userAgent ??
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
  const ref = isImage ? (cfg.imageReferer ?? cfg.baseUrl) : cfg.baseUrl;
  return {
    "User-Agent": ua,
    "Accept-Language": "en-US,en;q=0.9,id;q=0.8",
    "Origin":  cfg.baseUrl.replace(/\/$/, ""),
    "Referer": ref.replace(/\/$/, "") + "/",
    "Sec-Fetch-Site": "same-origin",
    "Sec-Fetch-Mode": "cors",
    "Sec-Fetch-Dest": isImage ? "image" : "empty",
    ...cfg.customHeaders,
    ...cfg.headers
  };
}

const OP_TIMEOUTS = { search: 10000, chapters: 20000, pages: 20000 };

export function getTimeout(cfg: SourceConfig, op: keyof typeof OP_TIMEOUTS): number {
  return cfg.timeouts?.[op] ?? OP_TIMEOUTS[op];
}

export function getFetchOpts(
  cfg: SourceConfig,
  op: "search" | "chapters" | "pages",
  extra?: FetchOptions
): FetchOptions {
  const isImage = extra?.headers?.Accept?.includes("image") || false;
  const baseHeaders = makeHeaders(cfg, isImage);
  return {
    timeout: getTimeout(cfg, op),
    retries: cfg.retries,
    retryDelayMs: cfg.retryDelay,
    concurrencyLimit: cfg.concurrencyLimit,
    rateLimitCooldown: cfg.rateLimitCooldown,
    retryOn: cfg.retryOn,
    sourceId: cfg.id,
    ...extra,
    headers: {
      ...baseHeaders,
      ...extra?.headers
    }
  };
}

export function derivePattern(baseUrl: string, exampleUrl: string) {
  const path = exampleUrl.replace(baseUrl.replace(/\/$/, ""), "").replace(/^\//, "");
  const segs = path.split("/").filter(Boolean);
  const prefix = segs.length > 1 ? "/" + segs.slice(0, -1).join("/") + "/" : "/";
  const suffix = exampleUrl.endsWith("/") ? "/" : "";
  return { prefix, suffix };
}

export function buildUrl(cfg: SourceConfig, exampleUrl: string, id: string): string {
  const p = derivePattern(cfg.baseUrl, exampleUrl);
  return cfg.baseUrl.replace(/\/$/, "") + p.prefix + id + p.suffix;
}

export function cleanTitle(title: string, cfg: SourceConfig): string {
  if (!title || !(cfg.titleAfterPipe || cfg.titleFromPipe)) return title;
  const idx = title.indexOf(" | ");
  return idx !== -1 ? title.slice(idx + 3).trim() || title : title;
}

export function applyImageTransform(url: string, cfg: SourceConfig): string {
  if (!url || !cfg.imageUrlPattern || !cfg.imageUrlReplacement) return url;
  try {
    return url.replace(new RegExp(cfg.imageUrlPattern), cfg.imageUrlReplacement);
  } catch { return url; }
}

export function processImageUrl(url: string, cfg: SourceConfig): string {
  if (!url) return url;
  let result = url;
  if (cfg.imageBase64Encoded) {
    try { result = Buffer.from(result, "base64").toString("utf8"); } catch { /* invalid base64 */ }
  }
  if (cfg.imageStripQueryParams) {
    result = result.split("?")[0];
  }
  return applyImageTransform(result, cfg);
}

export function proxyCover(url: string, cfg: SourceConfig): string {
  if (!url || !cfg.proxyImages) return url;
  return `/api/img?url=${encodeURIComponent(url)}`;
}

export function proxyPageImage(url: string, cfg: SourceConfig): string {
  if (!url || !cfg.proxyImages) return url;
  return `/api/img?url=${encodeURIComponent(url)}`;
}

export function extractDesc(
  item: Record<string, unknown>,
  nested: Record<string, unknown> | null
): string | undefined {
  const raw = (
    nested?.synopsis ?? nested?.description ?? nested?.sinopsis ?? nested?.summary ??
    item.synopsis    ?? item.description    ?? item.sinopsis    ?? item.summary
  ) as string | undefined;
  return raw?.trim() || undefined;
}

export function getField(item: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) {
    if (key in item && item[key] != null && item[key] !== "") return item[key];
  }
  return undefined;
}

export const ID_MONTHS: Record<string, string> = {
  januari:"01", februari:"02", maret:"03", april:"04", mei:"05", juni:"06",
  juli:"07", agustus:"08", september:"09", oktober:"10", november:"11", desember:"12"
};

// Month-first: "Mei 28, 2026" / "Januari 5 2026"
export const ID_DATE_RE = /\b(Januari|Februari|Maret|April|Mei|Juni|Juli|Agustus|September|Oktober|November|Desember)\s+(\d{1,2}),?\s+(\d{4})\b/i;

// Day-first: "28 Mei 2026" / "5 Januari 2026"
export const ID_DATE_DMY_RE = /\b(\d{1,2})\s+(Januari|Februari|Maret|April|Mei|Juni|Juli|Agustus|September|Oktober|November|Desember)\s+(\d{4})\b/i;

// Abbreviated month date: "May 26, 2026" / "Mar 31, 2026"
export const EN_DATE_RE = /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{1,2}),?\s+(\d{4})\b/i;

// DD/MM/YYYY or MM/DD/YYYY date: "12/05/2026" / "25/03/2026"
export const DMY_DATE_RE = /\b\d{1,2}\/\d{1,2}\/\d{4}\b/;

export function parseChapterDate(rawDate: string): string | undefined {
  if (!rawDate) return undefined;
  const dmyMatch    = rawDate.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  const idMatch     = ID_DATE_RE.exec(rawDate);
  const idDmyMatch  = ID_DATE_DMY_RE.exec(rawDate);
  if (dmyMatch) {
    return `${dmyMatch[3]}-${dmyMatch[2].padStart(2,"0")}-${dmyMatch[1].padStart(2,"0")}T00:00:00.000Z`;
  } else if (idDmyMatch) {
    const mm = ID_MONTHS[idDmyMatch[2].toLowerCase()];
    return `${idDmyMatch[3]}-${mm}-${idDmyMatch[1].padStart(2,"0")}T00:00:00.000Z`;
  } else if (idMatch) {
    const mm = ID_MONTHS[idMatch[1].toLowerCase()];
    return `${idMatch[3]}-${mm}-${idMatch[2].padStart(2,"0")}T00:00:00.000Z`;
  }
  const rel = rawDate.trim().toLowerCase();
  if (rel === "just now" || rel === "baru saja") return new Date().toISOString();
  if (rel === "yesterday" || rel === "kemarin") {
    const d = new Date(); d.setDate(d.getDate() - 1); return d.toISOString();
  }
  const relMatch = rel.match(/^(\d+)\s+(second|minute|hour|day|week|month|year|detik|menit|jam|hari|minggu|bulan|tahun)s?\s+(?:ago|yang\s+lalu|lalu)$/);
  if (relMatch) {
    const n = parseInt(relMatch[1], 10);
    const unit = relMatch[2];
    const ms = { second:1e3, detik:1e3, minute:6e4, menit:6e4, hour:36e5, jam:36e5,
                 day:864e5, hari:864e5, week:6048e5, minggu:6048e5,
                 month:2592e6, bulan:2592e6, year:31536e6, tahun:31536e6 }[unit] ?? 0;
    if (ms) return new Date(Date.now() - n * ms).toISOString();
  }
  const d = new Date(rawDate);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

export function extractTsReaderImages(html: string, chapterId: string): Page[] | null {
  const tsIdx = html.indexOf("ts_reader.run(");
  if (tsIdx === -1) return null;
  const after = html.slice(tsIdx);
  const m = after.match(/"images"\s*:\s*(\["[^"]*"(?:\s*,\s*"[^"]*")*\])/);
  if (!m) return null;
  try {
    const imgs = JSON.parse(m[1]) as string[];
    if (imgs.length > 0) {
      return imgs.map((imageUrl, i) => ({ chapterId, imageUrl, index: i }));
    }
  } catch { /* fall through */ }
  return null;
}
