import { CACHE_TTL_MS, MAX_RANGE_CHAPTERS } from "../constants.js";
import type { Chapter, ChapterBoundary, Page, ReadRangeResult, SearchResult } from "../../shared/types.js";

import { getAdapter } from "../adapters/index.js";
import { cache } from "./cacheService.js";
import { logger } from "../utils/logger.js";

export async function searchTitle(sourceId: string, query: string, fresh = false): Promise<SearchResult[]> {
  const adapter = getAdapter(sourceId);
  const key = `${sourceId}|${query.toLowerCase().trim()}`;
  if (!fresh) return cache.wrap("search", CACHE_TTL_MS.search, key, async () => {
    try { return await adapter.search(query); }
    catch (err) { logger.warn("search_failed", { sourceId, query, err: String(err) }); return []; }
  });
  try { return await adapter.search(query); }
  catch (err) { logger.warn("search_failed", { sourceId, query, err: String(err) }); return []; }
}

export async function getTitleInfo(sourceId: string, titleId: string, fresh = false): Promise<SearchResult | null> {
  const adapter = getAdapter(sourceId);
  if (!adapter.getTitleInfo) return null;
  const key = `${sourceId}|info|${titleId}`;
  if (!fresh) {
    const cached = cache.get<SearchResult>("search", CACHE_TTL_MS.search, key);
    if (cached !== undefined && cached !== null && cached.genres?.length) return cached;
  }
  try {
    const result = await adapter.getTitleInfo!(titleId);
    if (result?.genres?.length) cache.set("search", CACHE_TTL_MS.search, key, result);
    return result;
  } catch (err) {
    logger.warn("title_info_failed", { sourceId, titleId, err: String(err) });
    return null;
  }
}

export async function getChapters(sourceId: string, titleId: string): Promise<Chapter[]> {
  const adapter = getAdapter(sourceId);
  const key = `${sourceId}|${titleId}`;
  const cached = cache.get<Chapter[]>("chapters", CACHE_TTL_MS.chapters, key);
  if (cached !== undefined && cached.length > 0) return cached;
  try {
    const result = await adapter.getChapters(titleId);
    if (result.length > 0) cache.set("chapters", CACHE_TTL_MS.chapters, key, result);
    return result;
  } catch (err) {
    if (!String(err).startsWith("Error: circuit_open:")) {
      logger.warn("chapters_failed", { sourceId, titleId, err: String(err) });
    }
    return [];
  }
}

function classifyNetworkError(err: unknown): string | undefined {
  const msg = String(err);
  if (msg.includes("ETIMEDOUT") || msg.includes("timeout")) return "timeout";
  if (msg.includes("ECONNREFUSED") || msg.includes("ECONNRESET") || msg.includes("ENOTFOUND")) return "unreachable";
  return undefined;
}

export async function getChaptersResult(
  sourceId: string,
  titleId: string,
  fresh = false,
): Promise<{ chapters: Chapter[]; sourceError?: string }> {
  const adapter = getAdapter(sourceId);
  const key = `${sourceId}|${titleId}`;
  if (!fresh) {
    const cached = cache.get<Chapter[]>("chapters", CACHE_TTL_MS.chapters, key);
    if (cached !== undefined && cached.length > 0) return { chapters: cached };
  }
  try {
    const result = await adapter.getChapters(titleId);
    if (result.length > 0) cache.set("chapters", CACHE_TTL_MS.chapters, key, result);
    return { chapters: result };
  } catch (err) {
    if (!String(err).startsWith("Error: circuit_open:")) {
      logger.warn("chapters_failed", { sourceId, titleId, err: String(err) });
    }
    return { chapters: [], sourceError: classifyNetworkError(err) };
  }
}

export async function getPages(sourceId: string, chapterId: string): Promise<Page[]> {
  const adapter = getAdapter(sourceId);
  const key = `${sourceId}|${chapterId}`;
  return cache.wrap("pages", CACHE_TTL_MS.pages, key, async () => {
    try {
      return await adapter.getPages(chapterId);
    } catch (err) {
      logger.warn("pages_failed", { sourceId, chapterId, err: String(err) });
      return [];
    }
  });
}

export async function getPagesResult(
  sourceId: string,
  chapterId: string,
  fresh = false,
): Promise<{ pages: Page[]; sourceError?: string }> {
  const adapter = getAdapter(sourceId);
  const key = `${sourceId}|${chapterId}`;
  if (!fresh) {
    const cached = cache.get<Page[]>("pages", CACHE_TTL_MS.pages, key);
    if (cached !== undefined) return { pages: cached };
  }
  try {
    const result = await adapter.getPages(chapterId);
    cache.set("pages", CACHE_TTL_MS.pages, key, result);
    return { pages: result };
  } catch (err) {
    logger.warn("pages_failed", { sourceId, chapterId, err: String(err) });
    return { pages: [], sourceError: classifyNetworkError(err) };
  }
}

export async function readRange(
  sourceId: string,
  titleId: string,
  chapterStart: number,
  chapterEnd: number,
  onProgress?: (info: { done: number; total: number; current: Chapter }) => void
): Promise<ReadRangeResult> {
  const all = await getChapters(sourceId, titleId);
  const lo = Math.min(chapterStart, chapterEnd);
  const hi = Math.max(chapterStart, chapterEnd);
  const selected = all.filter((c) => c.number >= lo && c.number <= hi).slice(0, MAX_RANGE_CHAPTERS);

  const pages: Page[] = [];
  const boundaries: ChapterBoundary[] = [];
  const failed: { chapterId: string; reason: string }[] = [];
  let globalIndex = 0;
  let done = 0;

  for (const chapter of selected) {
    try {
      const chapterPages = await getPages(sourceId, chapter.id);
      if (chapterPages.length === 0) {
        failed.push({ chapterId: chapter.id, reason: "no_pages" });
      } else {
        const start = globalIndex;
        for (const p of chapterPages) {
          pages.push({ ...p, index: globalIndex });
          globalIndex++;
        }
        boundaries.push({
          chapterId: chapter.id,
          chapterNumber: chapter.number,
          chapterTitle: chapter.title,
          startIndex: start,
          endIndex: globalIndex - 1
        });
      }
    } catch (err) {
      failed.push({ chapterId: chapter.id, reason: String(err) });
    }
    done++;
    onProgress?.({ done, total: selected.length, current: chapter });
  }

  return { pages, boundaries, failed };
}
