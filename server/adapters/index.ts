import type { SourceConfig, ScrapingMethod, SearchResult, Chapter, Page } from "../../shared/types.js";
import type { SourceAdapter } from "./types.js";
import { LOGGER } from "../utils/logger.js";
import { AppError } from "../middlewares.js";
import { listConfigs } from "../services/sourceConfigService.js";
import { htmlSearch, htmlChapters, htmlPages, htmlTitleInfo, clearChapterNumReCache } from "./html/index.js";
import { wordpressSearch, wordpressChapters, wordpressPages, wordpressTitleInfo } from "./wordpress/index.js";
import { apiSearch, apiChapters, apiPages, apiTitleInfo } from "./api/index.js";
import { clearImageExtReCache } from "./html/pages.js";
import { clearImageTransformReCache } from "./shared.js";

export const VALID_CONFIG_KEYS = new Set<keyof SourceConfig>([
  "id", "baseUrl", "method", "urlFormat", "seriesUrl", "chapterUrl", "apiBase", "enabled", "createdAt",
  "name", "description", "language", "contentRating", "note", "color", "official",
  "seriesPath", "chapterPath", "nestedChapterIds", "titleAfterPipe", "titleFromPipe",
  "chapterNumberPattern", "chaptersAscending", "chapterDeduplicate",
  "chapterBatchSize", "chapterIdWithTitle",
  "proxyImages", "imageCdn", "imageReferer", "nextRsc",
  "selectors",
  "wordpress", "api", "search", "images", "network", "fallback",
  "knownMissing"
]);

function isHardError(err: unknown): boolean {
  return String(err).includes("EACCES");
}

type SearchFn    = (cfg: SourceConfig, query: string, signal?: AbortSignal) => Promise<SearchResult[]>;
type ChapterFn   = (cfg: SourceConfig, id: string, signal?: AbortSignal) => Promise<Chapter[]>;
type PageFn      = (cfg: SourceConfig, id: string, signal?: AbortSignal) => Promise<Page[]>;
type TitleInfoFn = (cfg: SourceConfig, id: string) => Promise<SearchResult | null>;

const METHOD_SEARCH: Record<ScrapingMethod, SearchFn> = {
  html:      htmlSearch,
  wordpress: wordpressSearch,
  api:       apiSearch,
};

const METHOD_CHAPTERS: Record<ScrapingMethod, ChapterFn> = {
  html:      htmlChapters,
  wordpress: wordpressChapters,
  api:       apiChapters,
};

const METHOD_PAGES: Record<ScrapingMethod, PageFn> = {
  html:      htmlPages,
  wordpress: wordpressPages,
  api:       apiPages,
};

const METHOD_TITLE_INFO: Record<ScrapingMethod, TitleInfoFn> = {
  html:      htmlTitleInfo,
  wordpress: wordpressTitleInfo,
  api:       apiTitleInfo,
};

function buildOperationChain(method: ScrapingMethod, fallback?: ScrapingMethod[]): ScrapingMethod[] {
  const fb = fallback ?? (method !== "html" ? ["html" as ScrapingMethod] : []);
  const chain = [method, ...fb];
  const seen = new Set<ScrapingMethod>();
  return chain.filter(scrMethod => seen.has(scrMethod) ? false : (seen.add(scrMethod), true));
}

async function runChain<R>(
  chain: ScrapingMethod[],
  op: string,
  sourceId: string,
  attempt: (scrMethod: ScrapingMethod) => Promise<R | undefined>,
): Promise<R | undefined> {
  for (const scrMethod of chain) {
    try {
      const outcome = await attempt(scrMethod);
      if (outcome !== undefined) return outcome;
    } catch (err) {
      if (isHardError(err)) throw err;
      LOGGER.debug("adapter_primary_failed", { source: sourceId, method: scrMethod, op, err: String(err) });
    }
  }
  return undefined;
}

export function createConfigurableAdapter(cfg: SourceConfig): SourceAdapter {
  if (!cfg.id) throw new Error("Missing required configuration field: id");
  if (!cfg.baseUrl) throw new Error(`Source "${cfg.id}": Missing required configuration field: baseUrl`);
  if (!cfg.method) throw new Error(`Source "${cfg.id}": Missing required configuration field: method`);
  if (cfg.enabled === undefined) throw new Error(`Source "${cfg.id}": Missing required configuration field: enabled`);

  for (const key of Object.keys(cfg)) {
    if (!VALID_CONFIG_KEYS.has(key as keyof SourceConfig)) {
      LOGGER.warn("unrecognized_config_key", { source: cfg.id, key });
    }
  }

  const method = cfg.method;
  const chain = buildOperationChain(method, cfg.fallback);

  return {
    info: {
      id: cfg.id,
      baseUrl: cfg.baseUrl,
      enabled: cfg.enabled,
      name: cfg.name ?? cfg.id.charAt(0).toUpperCase() + cfg.id.slice(1),
      language: cfg.language,
      contentRating: cfg.contentRating,
      note: cfg.note,
      color: cfg.color
    },

    async search(query, signal) {
      const chainResult = await runChain(chain, "search", cfg.id, async (scrMethod) => {
        const fn = METHOD_SEARCH[scrMethod];
        if (!fn) return undefined;
        const adapterResult = await fn(cfg, query, signal);
        return adapterResult.length ? adapterResult : undefined;
      });
      return chainResult ?? [];
    },

    async getChapters(titleId, signal) {
      const chainResult = await runChain(chain, "chapters", cfg.id, async (scrMethod) => {
        const fn = METHOD_CHAPTERS[scrMethod];
        if (!fn) return undefined;
        const adapterResult = await fn(cfg, titleId, signal);
        return adapterResult.length ? adapterResult : undefined;
      });
      return chainResult ?? [];
    },

    async getPages(chapterId, signal) {
      const chainResult = await runChain(chain, "pages", cfg.id, async (scrMethod) => {
        const fn = METHOD_PAGES[scrMethod];
        if (!fn) return undefined;
        const adapterResult = await fn(cfg, chapterId, signal);
        return adapterResult.length ? adapterResult : undefined;
      });
      return chainResult ?? [];
    },

    async getTitleInfo(titleId) {
      const chainResult = await runChain(chain, "titleInfo", cfg.id, async (scrMethod) => {
        const fn = METHOD_TITLE_INFO[scrMethod];
        if (!fn) return undefined;
        return (await fn(cfg, titleId)) ?? undefined;
      });
      return chainResult ?? null;
    }
  };
}

let registry = new Map<string, SourceAdapter>();

export function getAdapter(id: string): SourceAdapter {
  const adapter = registry.get(id);
  if (!adapter) throw new AppError(`Unknown source: ${id}`, 404);
  if (!adapter.info.enabled) throw new AppError(`Source disabled: ${id}`, 404);
  return adapter;
}

export function listAdapters() {
  return Array.from(registry.values()).map((adapter) => adapter.info);
}

export function listAdapterInstances(): SourceAdapter[] {
  return Array.from(registry.values()).filter((adapter) => adapter.info.enabled);
}

export function clearAdapterCaches(): void {
  clearChapterNumReCache();
  clearImageExtReCache();
  clearImageTransformReCache();
}

let loadInFlight: Promise<void> | null = null;

export async function loadConfigurableAdapters(): Promise<void> {
  // Coalesce concurrent loads so two calls cannot race to build competing next maps.
  if (loadInFlight) return loadInFlight;
  loadInFlight = (async () => {
    const configs = await listConfigs();
    const next = new Map<string, SourceAdapter>();
    for (const cfg of configs) {
      // Register disabled adapters so getAdapter reports "Source disabled", not "Unknown source".
      next.set(cfg.id, createConfigurableAdapter(cfg));
    }
    registry = next;
  })().finally(() => { loadInFlight = null; });
  return loadInFlight;
}
