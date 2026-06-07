import type { Page, SourceConfig } from "../../shared/types.js";
import type { FetchOptions } from "../services/fetchService.js";
import { signImageUrl } from "../utils/imageSign.js";
import { DEFAULT_UA } from "../constants.js";

// Cheerio.load is synchronous. Capping at 500 KB keeps event-loop blocking under ~10ms per call.
// Override with MAX_HTML_PARSE_CHARS env var when a source requires longer pages.
export const MAX_HTML_PARSE_CHARS = Number(process.env.MAX_HTML_PARSE_CHARS ?? 500 * 1024);

export function capHtml(html: string): string {
  return html.length > MAX_HTML_PARSE_CHARS ? html.slice(0, MAX_HTML_PARSE_CHARS) : html;
}

export function slug(href: string): string {
  return href.replace(/[?#].*$/, "").replace(/\/$/, "").split("/").at(-1) ?? "";
}

export function fixUrl(src: string, base: string, cfg?: SourceConfig): string {
  if (!src) return "";
  src = src.trim();
  if (src.startsWith("http")) return src;
  if (src.startsWith("//")) return `https:${src}`;
  const host = (cfg?.imageCdn || base).replace(/\/$/, "");
  if (src.startsWith("/")) return host + src;
  return src;
}

export function makeHeaders(cfg: SourceConfig, isImage = false) {
  const ua = cfg.network?.userAgent ?? DEFAULT_UA;
  const ref = isImage ? (cfg.imageReferer ?? cfg.baseUrl) : cfg.baseUrl;
  return {
    "User-Agent": ua,
    "Accept-Language": "en-US,en;q=0.9,id;q=0.8",
    "Origin":  cfg.baseUrl.replace(/\/$/, ""),
    "Referer": ref.replace(/\/$/, "") + "/",
    "Sec-Fetch-Site": "same-origin",
    "Sec-Fetch-Mode": "cors",
    "Sec-Fetch-Dest": isImage ? "image" : "empty",
    ...cfg.network?.headers
  };
}

const OP_TIMEOUTS = { search: 10000, chapters: 20000, pages: 20000 };

export function getTimeout(cfg: SourceConfig, op: keyof typeof OP_TIMEOUTS): number {
  return cfg.network?.timeouts?.[op] ?? OP_TIMEOUTS[op];
}

export function getFetchOpts(
  cfg: SourceConfig,
  op: "search" | "chapters" | "pages",
  extra?: FetchOptions,
  signal?: AbortSignal,
): FetchOptions {
  const isImage = extra?.headers?.Accept?.includes("image") || false;
  const baseHeaders = makeHeaders(cfg, isImage);
  return {
    timeout: getTimeout(cfg, op),
    retries: cfg.network?.retries,
    retryDelayMs: cfg.network?.retryDelay,
    concurrencyLimit: cfg.network?.concurrencyLimit,
    rateLimitCooldown: cfg.network?.rateLimitCooldown,
    retryOn: cfg.network?.retryOn,
    sourceId: cfg.id,
    ...extra,
    signal: signal ?? extra?.signal,
    headers: {
      ...baseHeaders,
      ...extra?.headers
    }
  };
}

export function resolveUrl(baseUrl: string, urlOrPath: string): string {
  if (!urlOrPath) return urlOrPath;
  if (urlOrPath.startsWith("http") || urlOrPath.startsWith("//")) return urlOrPath;
  const base = baseUrl.replace(/\/$/, "");
  return base + (urlOrPath.startsWith("/") ? "" : "/") + urlOrPath;
}

export function derivePattern(baseUrl: string, exampleUrl: string) {
  // Path-only format: "{slug}" placeholders count for depth but are never substituted (nested chapter IDs carry the full path).
  if (exampleUrl === "" || (!exampleUrl.startsWith("http") && !exampleUrl.startsWith("//"))) {
    const path = exampleUrl.startsWith("/") ? exampleUrl : "/" + exampleUrl;
    return {
      prefix: path.endsWith("/") ? path : path + "/",
      suffix: path.endsWith("/") ? "/" : "",
    };
  }
  // Legacy full-URL format: derive prefix by stripping baseUrl + last path segment.
  const path = exampleUrl.replace(baseUrl.replace(/\/$/, ""), "").replace(/^\//, "");
  const segs = path.split("/").filter(Boolean);
  const prefix = segs.length > 1 ? "/" + segs.slice(0, -1).join("/") + "/" : "/";
  const suffix = exampleUrl.endsWith("/") ? "/" : "";
  return { prefix, suffix };
}

// Percent-encodes each path segment while preserving "/" so an id cannot inject path/query/fragment structure.
export function encodePathSegments(id: string): string {
  return id.split("/").map(segment => encodeURIComponent(segment)).join("/");
}

export function buildUrl(cfg: SourceConfig, exampleUrl: string, id: string): string {
  const pattern = derivePattern(cfg.baseUrl, exampleUrl);
  return cfg.baseUrl.replace(/\/$/, "") + pattern.prefix + encodePathSegments(id) + pattern.suffix;
}

export function cleanTitle(title: string, cfg: SourceConfig): string {
  if (!title || !(cfg.titleAfterPipe || cfg.titleFromPipe)) return title;
  const idx = title.indexOf(" | ");
  return idx !== -1 ? title.slice(idx + 3).trim() || title : title;
}

export function safeRegex(pattern: string, flags = ""): RegExp | null {
  // Block ReDoS-prone constructs: nested quantifiers, char-class repeats, quantified alternation, repeated capturing groups
  if (/\([^()]*[+*?][^()]*\)[+*{]/.test(pattern)) return null;
  if (/\[[^\]]+\][+*?]\s*\[[^\]]+\][+*?]/.test(pattern)) return null;
  if (/\((?:[^()]+\|)+[^()]+\)[+*?{]/.test(pattern)) return null;
  if (/\(\??[^()]*[+*?][^()]*\)[+*]/.test(pattern)) return null;
  // Adjacent unbounded wildcards cause polynomial backtracking
  if (/\.\*\s*\.\*|\.\+\s*\.\+/.test(pattern)) return null;

  try { return new RegExp(pattern, flags); } catch { return null; }
}

// Cache per source. Null marks a pattern that failed the static ReDoS safety check.
const IMAGE_TRANSFORM_RE_CACHE = new Map<string, RegExp | null>();

export function clearImageTransformReCache(): void { IMAGE_TRANSFORM_RE_CACHE.clear(); }

export function applyImageTransform(url: string, cfg: SourceConfig): string {
  if (!url || !cfg.images?.urlPattern || !cfg.images?.urlReplacement) return url;
  let re = IMAGE_TRANSFORM_RE_CACHE.get(cfg.id);
  if (re === undefined) {
    re = safeRegex(cfg.images.urlPattern);
    IMAGE_TRANSFORM_RE_CACHE.set(cfg.id, re);
  }
  if (!re) return url;
  try {
    // Strip JS String.replace specials so the replacement cannot expand the matched portion.
    const safe = cfg.images.urlReplacement.replace(/\$[`'&]|\$<[^>]*>/g, "");
    return url.replace(re, safe);
  } catch { return url; }
}

export function processImageUrl(url: string, cfg: SourceConfig): string {
  if (!url) return url;
  let processed = url;
  if (cfg.images?.base64Encoded) {
    try { processed = Buffer.from(processed, "base64").toString("utf8"); } catch { /* invalid base64 */ }
  }
  if (cfg.images?.stripQueryParams) {
    processed = processed.split("?")[0];
  }
  return applyImageTransform(processed, cfg);
}

// Upgrade http to https for direct URLs to avoid mixed-content blocking under an HTTPS SPA.
function toHttps(url: string): string {
  return url.startsWith("http://") ? "https://" + url.slice(7) : url;
}

// When images.coverOptimizer is set, rewrite same-origin cover URLs through it to bypass CDN rate limits.
function applyCoverOptimizer(url: string, cfg: SourceConfig): string {
  const template = cfg.images?.coverOptimizer;
  if (!template || !cfg.baseUrl) return url;
  try {
    const target = new URL(url, cfg.baseUrl);
    const base = new URL(cfg.baseUrl);
    if (target.host !== base.host) return url;
    return base.origin + template.replace("{url}", encodeURIComponent(target.pathname + target.search));
  } catch { return url; }
}

export function proxyCover(url: string, cfg: SourceConfig): string {
  if (!url) return url;
  const optimized = applyCoverOptimizer(url, cfg);
  if (!cfg.proxyImages || /\.gif(\?|$)/i.test(optimized)) return toHttps(optimized);
  const httpsUrl = toHttps(optimized);
  const ref = cfg.imageReferer ? `&ref=${encodeURIComponent(cfg.imageReferer)}` : "";
  return `/api/img?url=${encodeURIComponent(httpsUrl)}${ref}&sig=${signImageUrl(httpsUrl)}`;
}

export function proxyPageImage(url: string, cfg: SourceConfig): string {
  if (!url) return url;
  if (!cfg.proxyImages) return toHttps(url);
  const httpsUrl = toHttps(url);
  const ref = cfg.imageReferer ? `&ref=${encodeURIComponent(cfg.imageReferer)}` : "";
  return `/api/img?url=${encodeURIComponent(httpsUrl)}${ref}&sig=${signImageUrl(httpsUrl)}`;
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'", nbsp: " ",
  mdash: "—", ndash: "–", hellip: "…",
  rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“"
};

function decodeEntities(str: string): string {
  return str
    .replace(/&#x([0-9a-fA-F]+);/g, (_match, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_match, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&([a-zA-Z]+);/g, (match, name) => NAMED_ENTITIES[name] ?? match);
}

export function htmlToText(html: string): string {
  const withBreaks = html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6]|blockquote)>/gi, "\n");
  const stripped = decodeEntities(withBreaks.replace(/<[^>]+>/g, ""));
  return stripped
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// Windows-1252 code points that do not map to their own byte value, keyed by code point.
const CP1252_REVERSE: Record<number, number> = {
  0x20ac: 0x80, 0x201a: 0x82, 0x0192: 0x83, 0x201e: 0x84, 0x2026: 0x85,
  0x2020: 0x86, 0x2021: 0x87, 0x02c6: 0x88, 0x2030: 0x89, 0x0160: 0x8a,
  0x2039: 0x8b, 0x0152: 0x8c, 0x017d: 0x8e, 0x2018: 0x91, 0x2019: 0x92,
  0x201c: 0x93, 0x201d: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97,
  0x02dc: 0x98, 0x2122: 0x99, 0x0161: 0x9a, 0x203a: 0x9b, 0x0153: 0x9c,
  0x017e: 0x9e, 0x0178: 0x9f
};

const UTF8_DECODER = new TextDecoder("utf-8", { fatal: true });

// Repairs UTF-8 misread as Windows-1252 mojibake by reversing the cp1252 byte mapping and re-decoding.
export function fixMojibake(str: string): string {
  if (!/[\u0080-\uffff]/.test(str)) return str;
  const bytes = new Uint8Array(str.length);
  for (let idx = 0; idx < str.length; idx++) {
    const code = str.charCodeAt(idx);
    if (code <= 0xff) bytes[idx] = code;
    else if (code in CP1252_REVERSE) bytes[idx] = CP1252_REVERSE[code];
    else return str;
  }
  try {
    return UTF8_DECODER.decode(bytes);
  } catch {
    return str;
  }
}

export function extractDesc(
  item: Record<string, unknown>,
  nested: Record<string, unknown> | null
): string | undefined {
  const raw = (
    nested?.synopsis ?? nested?.description ?? nested?.sinopsis ?? nested?.summary ??
    item.synopsis    ?? item.description    ?? item.sinopsis    ?? item.summary ??
    (item.excerpt as Record<string, unknown> | undefined)?.rendered
  ) as string | undefined;
  if (!raw) return undefined;
  return fixMojibake(htmlToText(raw)) || undefined;
}

export function toRecord(value: unknown): Record<string, unknown> {
  return (typeof value === "object" && value !== null ? value : {}) as Record<string, unknown>;
}

export function getField(item: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) {
    if (key.includes(".")) {
      const pathVal = getPath(item, key);
      if (pathVal != null && pathVal !== "") return pathVal;
    } else if (key in item && item[key] != null && item[key] !== "") {
      return item[key];
    }
  }
  return undefined;
}

export function getPath(root: unknown, pathStr?: string): unknown {
  if (!pathStr || !root) return root;
  const parts = pathStr.split(".");
  let cur: unknown = root;
  for (const part of parts) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

export const ID_MONTHS: Record<string, string> = {
  januari:"01", februari:"02", maret:"03", april:"04", mei:"05", juni:"06",
  juli:"07", agustus:"08", september:"09", oktober:"10", november:"11", desember:"12"
};

export const ID_DATE_RE = /\b(Januari|Februari|Maret|April|Mei|Juni|Juli|Agustus|September|Oktober|November|Desember)\s+(\d{1,2}),?\s+(\d{4})\b/i;
export const ID_DATE_DMY_RE = /\b(\d{1,2})\s+(Januari|Februari|Maret|April|Mei|Juni|Juli|Agustus|September|Oktober|November|Desember)\s+(\d{4})\b/i;
export const EN_DATE_RE = /\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|June?|July?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(\d{1,2}),?\s+(\d{4})\b/i;
export const DMY_DATE_RE = /\b\d{1,2}\/\d{1,2}\/\d{4}\b/;

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}(?:T[\d:.]+(?:Z|[+-]\d{2}:\d{2})?)?$/;

const EN_MON_NUM: Record<string, string> = {
  jan:"01", feb:"02", mar:"03", apr:"04", may:"05", jun:"06",
  jul:"07", aug:"08", sep:"09", oct:"10", nov:"11", dec:"12"
};

function monthsAgo(count: number): string {
  const date = new Date();
  date.setMonth(date.getMonth() - count);
  return date.toISOString();
}

function yearsAgo(count: number): string {
  const date = new Date();
  date.setFullYear(date.getFullYear() - count);
  return date.toISOString();
}

export function parseChapterDate(rawDate: string): string | undefined {
  if (!rawDate) return undefined;
  const dmyMatch    = rawDate.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  const idMatch     = ID_DATE_RE.exec(rawDate);
  const idDmyMatch  = ID_DATE_DMY_RE.exec(rawDate);
  // "16-May", "24-Oct" - DD-Mon without year
  const ddMonMatch  = rawDate.trim().match(/^(\d{1,2})[-\s](Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)$/i);
  if (ddMonMatch) {
    const day = ddMonMatch[1].padStart(2, "0");
    const mon = EN_MON_NUM[ddMonMatch[2].toLowerCase()];
    const year = new Date().getFullYear();
    const candidate = new Date(`${year}-${mon}-${day}T00:00:00.000Z`);
    if (candidate.getTime() > Date.now()) candidate.setFullYear(year - 1);
    return candidate.toISOString();
  }
  if (dmyMatch) {
    return `${dmyMatch[3]}-${dmyMatch[2].padStart(2,"0")}-${dmyMatch[1].padStart(2,"0")}T00:00:00.000Z`;
  } else if (idDmyMatch) {
    const mm = ID_MONTHS[idDmyMatch[2].toLowerCase()];
    return `${idDmyMatch[3]}-${mm}-${idDmyMatch[1].padStart(2,"0")}T00:00:00.000Z`;
  } else if (idMatch) {
    const mm = ID_MONTHS[idMatch[1].toLowerCase()];
    return `${idMatch[3]}-${mm}-${idMatch[2].padStart(2,"0")}T00:00:00.000Z`;
  }
  const enMatch = EN_DATE_RE.exec(rawDate);
  if (enMatch) {
    const mon = EN_MON_NUM[enMatch[1].slice(0, 3).toLowerCase()];
    const day = enMatch[2].padStart(2, "0");
    return `${enMatch[3]}-${mon}-${day}T00:00:00.000Z`;
  }
  const rel = rawDate.trim().toLowerCase();
  if (rel === "just now" || rel === "baru saja") return new Date().toISOString();
  if (rel === "yesterday" || rel === "kemarin") {
    const date = new Date(); date.setDate(date.getDate() - 1); return date.toISOString();
  }
  if (rel === "last week")  return new Date(Date.now() - 7 * 864e5).toISOString();
  if (rel === "last month") return monthsAgo(1);
  if (rel === "last year")  return yearsAgo(1);
  const relMatch = rel.match(/^((?:a|an)|\d+)\s+(second|minute|hour|day|week|month|year|detik|menit|jam|hari|minggu|bulan|tahun)s?\s*(?:ago|yang\s+lalu|lalu)?$/);
  if (relMatch) {
    const num = /^a(?:n)?$/i.test(relMatch[1]) ? 1 : parseInt(relMatch[1], 10);
    const unit = relMatch[2];
    // Months and years vary in length. Use calendar arithmetic instead of fixed-ms approximations.
    if (unit === "month" || unit === "bulan") return monthsAgo(num);
    if (unit === "year" || unit === "tahun")  return yearsAgo(num);
    const ms = { second:1e3, detik:1e3, minute:6e4, menit:6e4, hour:36e5, jam:36e5,
                 day:864e5, hari:864e5, week:6048e5, minggu:6048e5 }[unit] ?? 0;
    if (ms) return new Date(Date.now() - num * ms).toISOString();
  }
  const trimmed = rawDate.trim();
  if (!ISO_DATE_RE.test(trimmed)) return undefined;
  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) return undefined;
  if (date.getTime() > Date.now() + 365 * 864e5) return undefined;
  return date.toISOString();
}

const TS_READER_SEARCH_LIMIT = 64 * 1024;

export function extractTsReaderImages(html: string, chapterId: string): Page[] | null {
  const tsIdx = html.indexOf("ts_reader.run(");
  if (tsIdx === -1) return null;
  const after = html.slice(tsIdx, tsIdx + TS_READER_SEARCH_LIMIT);
  const match = after.match(/"images"\s*:\s*(\["[^"]*"(?:\s*,\s*"[^"]*")*\])/);
  if (!match) return null;
  if (match[1].length > 32 * 1024) return null;
  try {
    const imgs = JSON.parse(match[1]) as string[];
    if (imgs.length > 0) {
      return imgs.map((imageUrl, idx) => ({ chapterId, imageUrl, index: idx }));
    }
  } catch { /* fall through */ }
  return null;
}
