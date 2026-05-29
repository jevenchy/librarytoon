import type { SourceConfig } from "../../../shared/types.js";
import type { SourceAdapter } from "../types.js";
import { logger } from "../../utils/logger.js";
import { htmlSearch, htmlChapters, htmlPages, htmlTitleInfo } from "./html.js";
import { wpSearch, wpChapters, wpPages, wpTitleInfo } from "./wordpress.js";
import { apiSearch, apiChapters, apiPages, apiTitleInfo } from "./api.js";
import { graphqlSearch, graphqlChapters, graphqlPages, graphqlTitleInfo } from "./graphql.js";
import { nextjsSearch, nextjsChapters, nextjsPages, nextjsTitleInfo } from "./nextjs.js";

export type { SourceConfig };

const VALID_CONFIG_KEYS = new Set<string>([
  "id", "baseUrl", "method", "urlFormat", "seriesUrl", "chapterUrl", "apiBase", "enabled", "createdAt",
  "name", "description", "language", "contentRating", "note", "color", "official",
  "userAgent", "customHeaders", "headers", "timeouts", "concurrencyLimit", "retries", "retryOn", "retryDelay",
  "searchParam", "searchEndpoints", "searchLimit", "searchSupported", "searchAjaxFallback", "searchListingFallback", "listingUrl",
  "seriesPath", "chapterPath", "nestedChapterIds", "titleAfterPipe", "titleFromPipe", "idPattern", "chapterNumberPattern", "chaptersAscending", "chapterDeduplicate", "chapterBatchSize", "chapterIdWithTitle",
  "proxyImages", "imageCdn", "imageReferer", "imageExtensions", "imageExcludeKeywords", "imageBase64Encoded",
  "imageUrlPattern", "imageUrlReplacement", "imageStripQueryParams", "imageMinWidth",
  "selectors",
  "wpApiPath", "wpSkipReaderKiru", "wpReaderKiruPath", "wpMangaEndpoint", "wpChapterEndpoint", "wpChaptersPerPage", "wpCoverBatchSize", "wpReaderKiru", "wpTheme", "wpYoastCover", "wpFetchDates",
  "apiSearchEndpoints", "apiChapterEndpoints", "apiPageEndpoints", "apiEnvelope", "apiPagination", "apiCursorField", "apiTotalPagesField", "apiFieldMap", "apiChapterFieldMap", "apiPageFieldMap",
  "graphqlEndpoint", "graphqlSearchQuery", "graphqlSearchVar", "graphqlChaptersQuery", "graphqlPagesQuery", "graphqlSearchPath", "graphqlChaptersPath", "graphqlPagesPath",
  "nextDataPath", "nextChaptersPath", "nextPagesPath",
  "nuxtDataPath", "nuxtChaptersPath", "nuxtPagesPath",
  "rateLimit", "rateLimitCooldown",
  "knownMissing"
]);

export function createConfigurableAdapter(cfg: SourceConfig): SourceAdapter {
  // Validate required fields
  if (!cfg.id) throw new Error("Missing required configuration field: id");
  if (!cfg.baseUrl) throw new Error(`Source "${cfg.id}": Missing required configuration field: baseUrl`);
  if (!cfg.method) throw new Error(`Source "${cfg.id}": Missing required configuration field: method`);
  if (cfg.enabled === undefined) throw new Error(`Source "${cfg.id}": Missing required configuration field: enabled`);

  // Log unrecognized keys
  for (const key of Object.keys(cfg)) {
    if (!VALID_CONFIG_KEYS.has(key)) {
      logger.warn("unrecognized_config_key", { source: cfg.id, key });
    }
  }

  const method = cfg.method ?? "html";

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

    async search(query) {
      if (method === "wordpress") {
        try { const r = await wpSearch(cfg, query); if (r.length) return r; } catch { /**/ }
        return htmlSearch(cfg, query);
      }
      if (method === "api") {
        try { const r = await apiSearch(cfg, query); if (r.length) return r; } catch { /**/ }
        return htmlSearch(cfg, query);
      }
      if (method === "graphql") {
        try { const r = await graphqlSearch(cfg, query); if (r.length) return r; } catch { /**/ }
        return htmlSearch(cfg, query);
      }
      if (method === "nextjs" || method === "nuxtjs") {
        try { const r = await nextjsSearch(cfg, query); if (r.length) return r; } catch { /**/ }
        return htmlSearch(cfg, query);
      }
      return htmlSearch(cfg, query);
    },

    async getChapters(titleId) {
      if (method === "wordpress") {
        try { const r = await wpChapters(cfg, titleId); if (r.length) return r; } catch { /**/ }
        return htmlChapters(cfg, titleId);
      }
      if (method === "api") {
        try { const r = await apiChapters(cfg, titleId); if (r.length) return r; } catch { /**/ }
        return htmlChapters(cfg, titleId);
      }
      if (method === "graphql") {
        try { const r = await graphqlChapters(cfg, titleId); if (r.length) return r; } catch { /**/ }
        return htmlChapters(cfg, titleId);
      }
      if (method === "nextjs" || method === "nuxtjs") {
        try { const r = await nextjsChapters(cfg, titleId); if (r.length) return r; } catch { /**/ }
        return htmlChapters(cfg, titleId);
      }
      return htmlChapters(cfg, titleId);
    },

    async getPages(chapterId) {
      if (method === "wordpress") {
        try { const r = await wpPages(cfg, chapterId); if (r.length) return r; } catch { /**/ }
        return htmlPages(cfg, chapterId);
      }
      if (method === "api") {
        try { const r = await apiPages(cfg, chapterId); if (r.length) return r; } catch { /**/ }
        return htmlPages(cfg, chapterId);
      }
      if (method === "graphql") {
        try { const r = await graphqlPages(cfg, chapterId); if (r.length) return r; } catch { /**/ }
        return htmlPages(cfg, chapterId);
      }
      if (method === "nextjs" || method === "nuxtjs") {
        try { const r = await nextjsPages(cfg, chapterId); if (r.length) return r; } catch { /**/ }
        return htmlPages(cfg, chapterId);
      }
      return htmlPages(cfg, chapterId);
    },

    async getTitleInfo(titleId) {
      if (method === "api") {
        try { const r = await apiTitleInfo(cfg, titleId); if (r) return r; } catch { /**/ }
      }
      if (method === "wordpress") {
        try { const r = await wpTitleInfo(cfg, titleId); if (r) return r; } catch { /**/ }
      }
      if (method === "graphql") {
        try { const r = await graphqlTitleInfo(cfg, titleId); if (r) return r; } catch { /**/ }
      }
      if (method === "nextjs" || method === "nuxtjs") {
        try { const r = await nextjsTitleInfo(cfg, titleId); if (r) return r; } catch { /**/ }
      }
      return htmlTitleInfo(cfg, titleId);
    }
  };
}
