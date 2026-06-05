import type { Chapter, Page, SearchResult } from "../../shared/types.js";
import { getAdapter } from "../adapters/index.js";
import { LOGGER } from "../utils/logger.js";
import { CACHE, singleFlight } from "./cacheService.js";

function logSafe(value: string): string {
  return value.length > 80 ? value.slice(0, 80) + "..." : value;
}

// Folds typographic apostrophe/dash variants to ASCII so any spelling the user types still matches.
const APOSTROPHE_RE = /[''‚‛`´ʹʼˈ′＇]/g;
const DASH_RE = /[‐‑‒–—―−]/g;
function normalizeQuery(query: string): string {
  return query.replace(APOSTROPHE_RE, "'").replace(DASH_RE, "-");
}

export async function searchTitle(sourceId: string, query: string, signal?: AbortSignal): Promise<SearchResult[]> {
  const adapter = getAdapter(sourceId);
  const normalized = normalizeQuery(query);
  const key = `${sourceId}|${normalized.toLowerCase().trim()}`;
  const cached = CACHE.get<SearchResult[]>("search", key);
  if (cached !== undefined) return cached;
  const emptyHit = CACHE.get<SearchResult[]>("searchEmpty", key);
  if (emptyHit !== undefined) return emptyHit;
  return singleFlight(`search|${key}`, async (sharedSignal) => {
    try {
      const results = await adapter.search(normalized, sharedSignal);
      if (results.length > 0) {
        CACHE.set("search", key, results);
      } else {
        CACHE.set("searchEmpty", key, []);
      }
      return results;
    } catch (err) {
      if ((err as NodeJS.ErrnoException)?.code === "ERR_CANCELED") return [];
      LOGGER.warn("search_failed", { sourceId, query: logSafe(normalized), err: String(err) });
      return [];
    }
  }, signal);
}

export async function getTitleInfo(sourceId: string, titleId: string): Promise<SearchResult | null> {
  const adapter = getAdapter(sourceId);
  if (!adapter.getTitleInfo) return null;
  const key = `${sourceId}|info|${titleId}`;
  const cached = CACHE.get<SearchResult>("meta", key);
  if (cached !== undefined && cached !== null) return cached;
  try {
    const titleInfo = await adapter.getTitleInfo!(titleId);
    if (!titleInfo) return null;

    // Cache regardless of genre presence. Gating on genres left genre-less sources permanently uncached.
    CACHE.set("meta", key, titleInfo);
    return titleInfo;
  } catch (err) {
    LOGGER.warn("title_info_failed", { sourceId, titleId, err: String(err) });
    return null;
  }
}

function classifyNetworkError(err: unknown): string | undefined {
  const msg = String(err);
  if (msg.includes("EACCES") || msg.includes("SSRF blocked")) {
    LOGGER.error("ssrf_blocked", { err: msg });
    return "ssrf_blocked";
  }
  if (msg.includes("ETIMEDOUT") || msg.includes("timeout")) return "timeout";
  if (msg.includes("ECONNREFUSED") || msg.includes("ECONNRESET") || msg.includes("ENOTFOUND")) return "unreachable";
  return undefined;
}

const SOURCE_COOLDOWN_MS = 3 * 60_000;
const SOURCE_COOLDOWN = new Map<string, number>();

function isCoolingDown(sourceId: string): boolean {
  const until = SOURCE_COOLDOWN.get(sourceId);
  if (until === undefined) return false;
  if (Date.now() >= until) { SOURCE_COOLDOWN.delete(sourceId); return false; }
  return true;
}

function setCooldown(sourceId: string, errorType: string | undefined): void {
  if (errorType === "timeout" || errorType === "unreachable") {
    SOURCE_COOLDOWN.set(sourceId, Date.now() + SOURCE_COOLDOWN_MS);
    LOGGER.warn("source_cooling_down", { sourceId, cooldownMs: SOURCE_COOLDOWN_MS });
  }
}

export function clearSourceCooldowns(): void {
  SOURCE_COOLDOWN.clear();
}

export async function getChaptersResult(
  sourceId: string,
  titleId: string,
  signal?: AbortSignal,
): Promise<{ chapters: Chapter[]; sourceError?: string }> {
  const adapter = getAdapter(sourceId);
  const key = `${sourceId}|${titleId}`;

  const cached = CACHE.get<Chapter[]>("chapters", key);
  if (cached !== undefined && cached.length > 0) return { chapters: cached };

  // Check the empty-result cache to avoid re-scraping a known-empty source.
  const emptyHit = CACHE.get<Chapter[]>("chaptersEmpty", key);
  if (emptyHit !== undefined) return { chapters: [] };

  if (isCoolingDown(sourceId)) return { chapters: [], sourceError: "source_cooldown" };

  return singleFlight(`chapters|${key}`, async (sharedSignal) => {
    try {
      const chapters = await adapter.getChapters(titleId, sharedSignal);
      if (chapters.length > 0) {
        CACHE.set("chapters", key, chapters);
      } else {
        CACHE.set("chaptersEmpty", key, []);
      }
      return { chapters };
    } catch (err) {
      if ((err as NodeJS.ErrnoException)?.code === "ERR_CANCELED") return { chapters: [] };
      LOGGER.warn("chapters_failed", { sourceId, titleId: logSafe(titleId), err: String(err) });
      const sourceError = classifyNetworkError(err);
      setCooldown(sourceId, sourceError);
      return { chapters: [], sourceError };
    }
  }, signal);
}

export async function getPagesResult(
  sourceId: string,
  chapterId: string,
  signal?: AbortSignal,
): Promise<{ pages: Page[]; sourceError?: string }> {
  const adapter = getAdapter(sourceId);
  const key = `${sourceId}|${chapterId}`;

  const cached = CACHE.get<Page[]>("pages", key);
  if (cached !== undefined && cached.length > 0) return { pages: cached };

  const emptyHit = CACHE.get<Page[]>("pagesEmpty", key);
  if (emptyHit !== undefined) return { pages: [] };

  if (isCoolingDown(sourceId)) return { pages: [], sourceError: "source_cooldown" };

  return singleFlight(`pages|${key}`, async (sharedSignal) => {
    try {
      const pages = await adapter.getPages(chapterId, sharedSignal);
      if (pages.length > 0) {
        CACHE.set("pages", key, pages);
      } else {
        CACHE.set("pagesEmpty", key, []);
      }
      return { pages };
    } catch (err) {
      if ((err as NodeJS.ErrnoException)?.code === "ERR_CANCELED") return { pages: [] };
      LOGGER.warn("pages_failed", { sourceId, chapterId: logSafe(chapterId), err: String(err) });
      const sourceError = classifyNetworkError(err);
      setCooldown(sourceId, sourceError);
      return { pages: [], sourceError };
    }
  }, signal);
}
