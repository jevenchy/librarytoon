import * as cheerio from "cheerio";
import type { SearchResult, SourceConfig } from "../../../shared/types.js";
import { fetchJson, fetchText } from "../../services/fetchService.js";
import { fixUrl, getFetchOpts, slug, proxyCover, processImageUrl, capHtml } from "../shared.js";
import { RESERVED_SLUGS, buildChapterNumRe } from "../html/index.js";
import { extractYoastCover, rkBase, wpApiPath, seriesEndpoint, shouldRunReaderKiru, rkSeriesDetail, type WpPost } from "./index.js";

async function batchAllSettled<T>(items: T[], fn: (item: T) => Promise<T>, size = 5, signal?: AbortSignal): Promise<T[]> {
  const collected: T[] = [];
  for (let batchIdx = 0; batchIdx < items.length; batchIdx += size) {
    if (signal?.aborted) break;
    const batch = items.slice(batchIdx, batchIdx + size);
    const settled = await Promise.allSettled(batch.map(fn));
    collected.push(...settled.map((item, idx) => (item.status === "fulfilled" ? item.value : batch[idx])));
  }
  return collected;
}

async function rkSearch(cfg: SourceConfig, query: string, signal?: AbortSignal): Promise<SearchResult[]> {
  type RkItem = { id: number; title: string; slug: string; cover?: string; latest_chapters?: { number: number; modified_gmt?: string }[] };
  type RkRes = { ok: boolean; items?: RkItem[] };
  const limit = cfg.search?.limit ?? 40;
  const res = await fetchJson<RkRes>(
    `${cfg.baseUrl}${rkBase(cfg)}/search/series`,
    getFetchOpts(cfg, "search", {
      params: { q: query, per_page: limit },
      headers: { "Accept": "application/json" },
      retries: 2
    }, signal)
  );
  if (!res?.ok || !Array.isArray(res.items) || res.items.length === 0) return [];
  const base: SearchResult[] = res.items.map(item => ({
    id:              item.slug ?? String(item.id),
    title:           item.title,
    cover:           proxyCover(fixUrl(item.cover ?? "", cfg.baseUrl, cfg), cfg),
    latestChapter:   item.latest_chapters?.[0]?.number,
    seriesUpdatedAt: item.latest_chapters?.[0]?.modified_gmt,
    sourceId:        cfg.id,
  })).filter(item => item.id && item.title) as SearchResult[];

  // Enrich only the first 10 results to avoid flooding the source with detail calls.
  const enrichLimit = Math.min(base.length, 10);
  const batchSize = cfg.wordpress?.coverBatchSize ?? 3;
  const enriched = await batchAllSettled(base.slice(0, enrichLimit), async (result) => {
    const full = await rkSeriesDetail(cfg, result.id, signal);
    return full ?? result;
  }, batchSize, signal);
  return [...enriched, ...base.slice(enrichLimit)];
}

async function wpHtmlSearch(cfg: SourceConfig, query: string, signal?: AbortSignal): Promise<SearchResult[]> {
  const enc = encodeURIComponent(query);
  const postType = seriesEndpoint(cfg);
  // Try the configured post type first, then wp-manga. Some sites use "manga" as the rewrite slug.
  const urls = [
    `${cfg.baseUrl}/?s=${enc}&post_type=${postType}`,
    ...(postType !== "wp-manga" ? [`${cfg.baseUrl}/?s=${enc}&post_type=wp-manga`] : []),
    `${cfg.baseUrl}/?s=${enc}`,
  ];

  const itemSel  = ".c-tabs-item__content,.page-item-detail,.c-image-hover,.tab-item";
  const titleSel = ".post-title h3 a,.post-title h5 a,.h5 a";
  const chapSel  = ".chapter,.chapter-item .chapter,.latest-chap";
  const chapNumRe = buildChapterNumRe(cfg);
  // The generic /?s= fallback searches all post types. Filter to the series path to exclude blog leakage.
  const seriesPath = cfg.seriesUrl && cfg.seriesUrl !== "/" ? cfg.seriesUrl : "";

  for (const url of urls) {
    try {
      const html = capHtml(await fetchText(url, getFetchOpts(cfg, "search", { retries: 1 }, signal)));
      const $ = cheerio.load(html);
      const results: SearchResult[] = [];
      const seenIds = new Set<string>();

      $(itemSel).each((_slot, el) => {
        const anchor = $(el).find("a").first();
        const href  = anchor.attr("href") ?? "";
        if (seriesPath && href && !href.includes(seriesPath)) return;
        const id    = slug(href);
        const title = $(el).find(titleSel).first().text().trim() || anchor.attr("title") || "";
        const imgEl = $(el).find("img").first();
        const rawSrc =
          imgEl.attr("data-src") ?? imgEl.attr("data-lazy-src") ?? imgEl.attr("src") ?? "";
        const cover  = proxyCover(fixUrl(processImageUrl(rawSrc, cfg), cfg.baseUrl, cfg), cfg);
        const chapText  = $(el).find(chapSel).first().text().trim();
        const chapMatch = chapText.match(chapNumRe) ?? chapText.match(/(\d+(?:\.\d+)?)\s*$/);
        const latestChapter = chapMatch ? Number(chapMatch[1]) : undefined;
        if (id && !RESERVED_SLUGS.has(id) && title && !seenIds.has(id)) {
          seenIds.add(id);
          results.push({ id, title, cover, latestChapter, sourceId: cfg.id });
        }
      });

      if (results.length > 0) return results;
    } catch { /* try next url */ }
  }
  return [];
}

export async function wordpressSearch(cfg: SourceConfig, query: string, signal?: AbortSignal): Promise<SearchResult[]> {
  const isRkEnabled = shouldRunReaderKiru(cfg);
  if (isRkEnabled) {
    try {
      const rkResults = await rkSearch(cfg, query, signal);
      if (rkResults.length > 0) return rkResults;
      if (cfg.wordpress?.readerKiru === true) return [];
    } catch (err) {
      if (cfg.wordpress?.readerKiru === true) throw err;
    }
  }
  if (cfg.wordpress?.readerKiru === true) return [];
  if (cfg.wordpress?.theme === "comicsera") return [];

  const apiPath = wpApiPath(cfg);
  const searchParam = cfg.search?.param || "search";
  let list: WpPost[] | null = null;
  try {
    list = await fetchJson<WpPost[]>(
      `${cfg.baseUrl}${apiPath}/${seriesEndpoint(cfg)}`,
      getFetchOpts(cfg, "search", {
        params: { [searchParam]: query, per_page: cfg.search?.limit ?? 40, _fields: "slug,title,link,yoast_head,modified_gmt" },
        retries: 2
      }, signal)
    );
  } catch { /* REST API unavailable - fall through to HTML search */ }
  if (!Array.isArray(list) || list.length === 0) return wpHtmlSearch(cfg, query, signal);

  const restMapped = list.map(post => {
    const coverUrl = (cfg.wordpress?.yoastCover !== false) ? extractYoastCover(post.yoast_head) : "";
    return {
      id:              post.link.replace(/\/$/, "").split("/").at(-1) ?? post.slug,
      title:           post.title?.rendered ?? post.slug,
      cover:           coverUrl ? proxyCover(fixUrl(coverUrl, cfg.baseUrl, cfg), cfg) : "",
      seriesUpdatedAt: post.modified_gmt || undefined,
      sourceId:        cfg.id,
    };
  }).filter(item => item.id && !RESERVED_SLUGS.has(item.id) && item.title);

  // When no cover plugin is active, all REST covers are empty. Fall through to HTML search which
  // can extract covers and latestChapter directly from the listing page.
  const hasCovers = restMapped.some(item => item.cover);
  if (!hasCovers) {
    const htmlResults = await wpHtmlSearch(cfg, query, signal);
    if (htmlResults.length > 0) {
      const restDateMap = new Map(restMapped.map(item => [item.id, item.seriesUpdatedAt]));
      return htmlResults.map(item => ({
        ...item,
        seriesUpdatedAt: restDateMap.get(item.id) ?? item.seriesUpdatedAt,
      }));
    }
  }

  return restMapped;
}
