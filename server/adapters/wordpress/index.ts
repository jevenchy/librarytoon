import * as cheerio from "cheerio";
import type { SearchResult, SourceConfig } from "../../../shared/types.js";
import { fetchJson } from "../../services/fetchService.js";
import { fixUrl, getFetchOpts, slug, proxyCover } from "../shared.js";

// Shared helpers alongside re-exports. Operation modules import back from here creating a safe cycle.
export type WpPost = {
  id?: number;
  slug: string;
  title: { rendered: string };
  link: string;
  excerpt?: { rendered: string };
  content?: { rendered: string };
  yoast_head?: string;
  date_gmt?: string;
  modified_gmt?: string;
  class_list?: string[];
};

export function extractYoastCover(yoastHead: string | undefined): string {
  if (!yoastHead) return "";
  const match = yoastHead.match(/og:image[^>]+content="(https?:\/\/[^"]+)"/);
  return match ? match[1] : "";
}

export function rkBase(cfg: SourceConfig): string {
  return (cfg.wordpress?.readerKiruPath ?? "/wp-json/readerkiru/v1").replace(/\/$/, "");
}

export function wpApiPath(cfg: SourceConfig): string {
  return (cfg.wordpress?.apiPath ?? "/wp-json/wp/v2").replace(/\/$/, "");
}

export function seriesEndpoint(cfg: SourceConfig): string {
  return cfg.wordpress?.seriesEndpoint ?? "manga";
}

export function chapterEndpoint(cfg: SourceConfig): string {
  return cfg.wordpress?.chapterEndpoint ?? "chapter";
}

export function shouldRunReaderKiru(cfg: SourceConfig): boolean {
  if (cfg.wordpress?.skipReaderKiru) return false;
  if (cfg.wordpress?.readerKiru === false) return false;
  return true;
}

type RkSeriesResponse = {
  ok: boolean;
  series?: {
    id: number; title: string; slug: string; cover?: string;
    description?: string;
    latest_chapters?: { number: number; modified_gmt?: string }[];
    genre?: string[];
    type?: string[];
    modified_gmt?: string;
    alternative_title?: string;
  };
};

export async function rkSeriesDetail(cfg: SourceConfig, titleId: string, signal?: AbortSignal): Promise<SearchResult | null> {
  const res = await fetchJson<RkSeriesResponse>(
    `${cfg.baseUrl}${rkBase(cfg)}/series/${titleId}`,
    getFetchOpts(cfg, "search", {
      headers: { "Accept": "application/json" },
      retries: 2
    }, signal)
  );
  if (!res?.ok || !res.series?.title) return null;
  const series = res.series;
  const latestChapter = series.latest_chapters?.[0]?.number;
  const description = series.description
    ? cheerio.load(series.description).text().replace(/\s+/g, " ").trim() || undefined
    : undefined;
  return {
    id:               series.slug ?? String(series.id),
    title:            series.title,
    cover:            proxyCover(fixUrl(series.cover ?? "", cfg.baseUrl, cfg), cfg),
    description,
    latestChapter,
    sourceId:         cfg.id,
    genres:           series.genre?.length ? series.genre : undefined,
    type:             series.type?.[0],
    seriesUpdatedAt:  series.latest_chapters?.[0]?.modified_gmt ?? series.modified_gmt,
    alternativeTitle: series.alternative_title || undefined,
  };
}

export { wordpressSearch } from "./search.js";
export { wordpressChapters } from "./chapters.js";
export { wordpressPages } from "./pages.js";
export { wordpressEnrichTitleFromBareArray, wordpressTitleInfo } from "./titleInfo.js";
