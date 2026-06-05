import * as cheerio from "cheerio";
import type { Chapter, SourceConfig } from "../../../shared/types.js";
import { safeRegex, MAX_HTML_PARSE_CHARS } from "../shared.js";

// Shared helpers alongside re-exports. Operation modules import back from here creating a safe cycle.
export async function loadHtml(html: string): Promise<cheerio.CheerioAPI> {
  const doc = html.length > MAX_HTML_PARSE_CHARS ? html.slice(0, MAX_HTML_PARSE_CHARS) : html;
  await new Promise<void>(resolve => setImmediate(resolve));
  return cheerio.load(doc);
}

const DEFAULT_CHAPTER_NUM_RE = /(?:chapter|ch|bab|episode|ep)[.\s#-]*(\d+(?:\.\d+)?)/i;
export const RESERVED_SLUGS = new Set(["manga", "manhwa", "manhua", "komik", "webtoon", "novel", "search", "page", "comics"]);

// Cache per source. Null marks a pattern that failed the static ReDoS safety check.
const CHAPTER_NUM_RE_CACHE = new Map<string, RegExp>();

export function clearChapterNumReCache(): void { CHAPTER_NUM_RE_CACHE.clear(); }

export function buildChapterNumRe(cfg: SourceConfig): RegExp {
  const cached = CHAPTER_NUM_RE_CACHE.get(cfg.id);
  if (cached) return cached;
  let re = DEFAULT_CHAPTER_NUM_RE;
  if (cfg.chapterNumberPattern) {
    const compiled = safeRegex(cfg.chapterNumberPattern, "i");
    if (compiled) re = compiled;
  }
  CHAPTER_NUM_RE_CACHE.set(cfg.id, re);
  return re;
}

// Collects self.__next_f.push([1,"..."]) chunks and JSON.parse-strips the outer escaping layer.
export function decodeNextRscStream(html: string): string {
  const chunks: string[] = [];
  const chunkRe = /\.__next_f\.push\(\[1,"((?:[^"\\]|\\.)*)"\]\)/g;
  let match: RegExpExecArray | null;
  while ((match = chunkRe.exec(html)) !== null) {
    try { chunks.push(JSON.parse(`"${match[1]}"`)); } catch { /* skip malformed chunk */ }
  }
  return chunks.length > 0 ? chunks.join("") : html.replace(/\\"/g, '"');
}

export function extractAstroIslandChapters(
  html: string, titleId: string, seriesPrefix: string, cfg: SourceConfig
): { chapters: Chapter[]; hasAccessibilityData: boolean } {
  const islandRe = /props="([^"]+)"/g;
  let bestProps = "";
  let bestCount = 0;
  let match: RegExpExecArray | null;
  while ((match = islandRe.exec(html)) !== null) {
    const raw = match[1];
    if (!raw.includes("chapters")) continue;
    const count = (raw.match(/number.*?\[0,\d/g) ?? []).length;
    if (count > bestCount) { bestCount = count; bestProps = raw; }
  }
  if (bestCount === 0) return { chapters: [], hasAccessibilityData: false };

  const decoded = cheerio.load(`<span>${bestProps}</span>`)("span").text();

  if (!decoded.includes('"chapters":[1,')) return { chapters: [], hasAccessibilityData: false };

  const hasAccessibilityData =
    decoded.includes('"isAccessible":[0,') ||
    decoded.includes('"is_locked":[0,')    ||
    decoded.includes('"is_premium":[0,');
  const chapters: Chapter[] = [];
  const seen = new Set<number>();
  const re = /"number":\[0,(\d+(?:\.\d+)?)\][^}]*?"slug":\[0,"([^"]+)"[^}]*?"(?:createdAt|created_at|published_at)":\[0,"([^"]+)"/g;
  const matches: RegExpExecArray[] = [];
  while ((match = re.exec(decoded)) !== null) matches.push(match);
  for (let idx = 0; idx < matches.length; idx++) {
    const chapterMatch = matches[idx];
    const num = Number(chapterMatch[1]);
    const chapterSlug = chapterMatch[2];
    const createdAt = chapterMatch[3];
    if (Number.isNaN(num) || !chapterSlug || seen.has(num)) continue;

    if (hasAccessibilityData) {
      // Bound context to this chapter object so a later locked chapter does not bleed into the window.
      const end = idx + 1 < matches.length ? matches[idx + 1].index : chapterMatch.index + 600;
      const contextSlice = decoded.slice(chapterMatch.index, end);
      const accessMatch    = contextSlice.match(/"isAccessible":\[0,(true|false)\]/);
      const isLockedMatch  = contextSlice.match(/"is_locked":\[0,(true|false)\]/);
      const isPremiumMatch = contextSlice.match(/"is_premium":\[0,(true|false)\]/);
      if (accessMatch?.[1]    === "false") continue;
      if (isLockedMatch?.[1]  === "true")  continue;
      if (isPremiumMatch?.[1] === "true")  continue;
    }

    seen.add(num);
    const id = seriesPrefix ? `${seriesPrefix}/${titleId}/${chapterSlug}` : `${titleId}/${chapterSlug}`;
    chapters.push({ id, title: `Chapter ${num}`, number: num, sourceId: cfg.id, titleId, chapterUpdatedAt: createdAt || undefined });
  }
  return { chapters, hasAccessibilityData };
}

// RSC source: chapter list is in self.__next_f, not the DOM. IDs are built from cfg.chapterUrl.
export function extractNextRscChapters(html: string, titleId: string, cfg: SourceConfig): Chapter[] {
  const decoded = decodeNextRscStream(html);
  const chapterPrefix = cfg.chapterUrl.replace("{slug}", titleId).replace(/^\//, "").replace(/\/$/, "");
  const chapters: Chapter[] = [];
  const seen = new Set<number>();
  const re = /"id":"(c[a-z0-9]{16,})","number":(\d+(?:\.\d+)?),"title":"([^"]*)"/g;
  const matches: RegExpExecArray[] = [];
  let match: RegExpExecArray | null;
  while ((match = re.exec(decoded)) !== null) matches.push(match);
  for (let idx = 0; idx < matches.length; idx++) {
    const chapterMatch = matches[idx];
    const num = Number(chapterMatch[2]);
    if (Number.isNaN(num) || seen.has(num)) continue;
    // Bound context to the chapter object. A fixed-size window bleeds flags from later locked chapters.
    const end = idx + 1 < matches.length ? matches[idx + 1].index : chapterMatch.index + 600;
    const ctx = decoded.slice(chapterMatch.index, end);
    if (/"isLocked":true/.test(ctx) || /"hasAccess":false/.test(ctx)) continue;
    seen.add(num);
    const pubMatch = ctx.match(/"publishedAt":"([^"]+)"/);
    chapters.push({
      id: `${chapterPrefix}/${num}`,
      title: chapterMatch[3].trim() || `Chapter ${num}`,
      number: num,
      sourceId: cfg.id,
      titleId,
      chapterUpdatedAt: pubMatch?.[1] || undefined,
    });
  }
  return chapters.sort((chap1, chap2) => chap1.number - chap2.number);
}

export function extractAstroGenres(html: string): string[] {
  const islandRe = /props="([^"]+)"/g;
  let match: RegExpExecArray | null;
  while ((match = islandRe.exec(html)) !== null) {
    const decoded = match[1].replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&#34;/g, '"');
    if (!decoded.includes('"genres"')) continue;
    const genres: string[] = [];
    const nameRe = /"name":\[0,"([^"]+)"/g;
    const genresIdx = decoded.indexOf('"genres"');
    const afterGenres = decoded.slice(genresIdx, genresIdx + 4000);
    let nameMatch: RegExpExecArray | null;
    while ((nameMatch = nameRe.exec(afterGenres)) !== null) {
      if (!genres.includes(nameMatch[1])) genres.push(nameMatch[1]);
    }
    if (genres.length > 0) return genres;
  }
  return [];
}

export { htmlSearch } from "./search.js";
export { htmlChapters } from "./chapters.js";
export { htmlPages } from "./pages.js";
export { htmlTitleInfo } from "./titleInfo.js";
