import type { SearchResult, SourceConfig } from "../../../shared/types.js";
import { fetchJson, fetchText } from "../../services/fetchService.js";
import { LOGGER } from "../../utils/logger.js";
import {
  slug, fixUrl, getFetchOpts, derivePattern, resolveUrl, cleanTitle, proxyCover, processImageUrl
} from "../shared.js";
import { loadHtml, buildChapterNumRe, RESERVED_SLUGS, decodeNextRscStream } from "./index.js";

const DEFAULT_SEARCH_ITEM =
  ".bsx,.bs,.bge,.item,.manga-item,.comic-item,article.post,.list-update_item" +
  ",.page-item-detail,.c-tabs-item,.tab-item,.manga_new";
const DEFAULT_SEARCH_TITLE = ".tt,.title,h3,h2,.post-title,[class*='title']";
const DEFAULT_SEARCH_COVER = "img";

export async function htmlSearch(cfg: SourceConfig, query: string, signal?: AbortSignal): Promise<SearchResult[]> {
  // Sources with supported=false skip the URL cascade and listing fallback to avoid wasted requests.
  if (cfg.search?.supported === false) return [];
  const seriesPattern = derivePattern(cfg.baseUrl, cfg.seriesUrl);
  const pathPart = seriesPattern.prefix.replace(/^\//, "").replace(/\/$/, "");
  const enc = encodeURIComponent(query);

  // RSC sources expose a clean JSON search API even though chapters/pages are RSC-only.
  if (cfg.nextRsc && cfg.search?.endpoints?.length) {
    type RscHit = { title?: string; slug?: string; urlSlug?: string; coverImage?: string; chapterCount?: number };
    const searchUrl = resolveUrl(cfg.baseUrl, cfg.search.endpoints[0]).replace("{q}", enc);
    try {
      const rscResponse = await fetchJson<{ series?: RscHit[] }>(searchUrl, getFetchOpts(cfg, "search", { retries: 1 }, signal));
      const results = (rscResponse.series ?? []).map(hit => ({
        id: hit.slug ?? hit.urlSlug ?? "",
        title: hit.title ?? "",
        cover: proxyCover(fixUrl(processImageUrl(hit.coverImage ?? "", cfg), cfg.baseUrl, cfg), cfg),
        latestChapter: typeof hit.chapterCount === "number" ? hit.chapterCount : undefined,
        sourceId: cfg.id,
      })).filter(item => item.id && item.title);
      if (results.length > 0) return results;
    } catch {
      // RSC search endpoint failed. Falls through to parsing generic HTML search results.
    }
  }

  let urls: string[];
  if (cfg.search?.endpoints && cfg.search.endpoints.length > 0) {
    urls = cfg.search.endpoints.map(endpoint => {
      const resolved = resolveUrl(cfg.baseUrl, endpoint);
      return resolved.replace("{base}", cfg.baseUrl).replace("{q}", enc)
                     .replace("{searchParam}", cfg.search?.param ?? "s");
    });
  } else {
    urls = [
      `${cfg.baseUrl}/?s=${enc}`,
      `${cfg.baseUrl}/?s=${enc}&post_type=wp-manga`,
      `${cfg.baseUrl}/search?q=${enc}`,
      `${cfg.baseUrl}/search?keyword=${enc}`
    ];
    if (cfg.search?.param) {
      urls.unshift(`${cfg.baseUrl}/advanced-search/?${cfg.search.param}=${enc}`);
    } else {
      urls.push(`${cfg.baseUrl}/advanced-search/?search_term=${enc}`);
    }
  }

  const norm = (str: string) => str.toLowerCase().normalize("NFKD").replace(/[‘’`´‚‛]/g, "'");
  const normalizedQuery = norm(query);

  const sel = cfg.selectors;
  const searchItemSel  = sel?.searchItem  ?? DEFAULT_SEARCH_ITEM;
  const searchTitleSel = sel?.searchTitle ?? DEFAULT_SEARCH_TITLE;
  const imageAttr      = sel?.imageAttr;
  const chapNumRe      = buildChapterNumRe(cfg);

  const tryUrl = async (searchUrl: string): Promise<SearchResult[]> => {
    try {
      const html = await fetchText(searchUrl, getFetchOpts(cfg, "search", { retries: 1 }, signal));
      const $ = await loadHtml(html);
      const results: SearchResult[] = [];
      const seenIds = new Set<string>();

      $(searchItemSel).each((_slot, el) => {
        const anchor = $(el).find("a").first();
        const href = anchor.attr("href") ?? "";
        const id = slug(href);
        const rawTitle =
          $(el).find(searchTitleSel).first().text().trim() ||
          anchor.attr("title") || "";
        const title = cleanTitle(rawTitle, cfg);
        const imgEl = $(el).find(sel?.searchCover ?? DEFAULT_SEARCH_COVER).first();
        let rawSrc = imageAttr
          ? (imgEl.attr(imageAttr) ?? "")
          : (imgEl.attr("data-src") ?? imgEl.attr("data-lazy-src") ?? imgEl.attr("src") ?? "");
        if (!rawSrc) {
          const bgEl = $(el).find("[style*='background-image']").first();
          const bgStyle = bgEl.attr("style") ?? "";
          const bgm = bgStyle.match(/background-image:\s*url\(['"]?([^'")\s]+)['"]?\)/);
          if (bgm) rawSrc = bgm[1];
        }
        const cover = proxyCover(fixUrl(processImageUrl(rawSrc, cfg), cfg.baseUrl, cfg), cfg);
        const epxsSel = sel?.searchLatestChapter ?? ".epxs,.ep-date,.eph-num,.chapternum,.chapter-item,.tray-item";
        const epxsText = $(el).find(epxsSel).first().text().trim();
        const chMatch = epxsText.match(chapNumRe) ?? epxsText.match(/(\d+(?:\.\d+)?)\s*$/) ?? epxsText.match(/^(\d+(?:\.\d+)?)/);
        const latestChapter = chMatch ? Number(chMatch[1]) : undefined;
        if (id && !RESERVED_SLUGS.has(id) && title && !seenIds.has(id)) {
          seenIds.add(id);
          results.push({
            id, title, cover, latestChapter, sourceId: cfg.id,
            type: sel?.seriesType ? $(el).find(sel.seriesType).first().text().trim() || undefined : undefined,
          });
        }
      });

      if (results.length === 0 && pathPart) {
        const safePathPart = pathPart.replace(/["[\]\\]/g, "\\$&");
        $(`a[href*="/${safePathPart}/"]`).each((_slot, el) => {
          const href = $(el).attr("href") ?? "";
          if (!href.includes(`/${pathPart}/`)) return;
          const id = slug(href);
          const rawTitle =
            $(el).find("img").attr("alt") ||
            $(el).find("[class*='title'],h3,h2").first().text().trim() ||
            $(el).attr("title") || $(el).text().trim();
          const title = cleanTitle(rawTitle, cfg);
          if (!title || !norm(title).includes(normalizedQuery)) return;
          const imgEl = $(el).find("img").first();
          const rawSrc = imgEl.attr("data-src") ?? imgEl.attr("src") ?? "";
          const cover = proxyCover(fixUrl(processImageUrl(rawSrc, cfg), cfg.baseUrl, cfg), cfg);
          if (id && !RESERVED_SLUGS.has(id) && !seenIds.has(id)) {
            seenIds.add(id);
            results.push({ id, title, cover, sourceId: cfg.id });
          }
        });
      }

      if (results.length === 0) throw new Error("no results");
      return results;
    } catch (err) {
      const msg = String(err);
      if (msg.includes("EACCES")) {
        LOGGER.warn("search_blocked", { source: cfg.id, url: searchUrl, err: msg });
      }
      throw err;
    }
  };

  let urlResults: SearchResult[] = [];
  if (!cfg.nextRsc || cfg.search?.endpoints?.length) {
    for (const url of urls) {
      if (signal?.aborted) break;
      try {
        const found = await tryUrl(url);
        if (found.length > 0) { urlResults = found; break; }
      } catch (err) {
        if ((err as NodeJS.ErrnoException)?.code === "EACCES") break;
      }
    }
  }
  if (urlResults.length > 0) return urlResults;

  // AJAX search fallback (many sites do not include results in initial HTML)
  if (cfg.search?.ajaxFallback !== false) {
    try {
      type AjaxHit = { url?: string; title?: string; thumb?: string };
      type AjaxRes = { success: boolean; data?: AjaxHit[] };
      const ajaxRes = await fetchJson<AjaxRes>(
        `${cfg.baseUrl}/wp-admin/admin-ajax.php`,
        getFetchOpts(cfg, "search", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          data: `action=wp-manga-search-manga&title=${enc}`,
          retries: 1
        }, signal)
      );
      if (ajaxRes.success && Array.isArray(ajaxRes.data) && ajaxRes.data.length > 0) {
        return ajaxRes.data.map(item => ({
          id:    slug(item.url ?? ""),
          title: item.title ?? "",
          cover: fixUrl(item.thumb ?? "", cfg.baseUrl),
          sourceId: cfg.id
        })).filter(item => item.id && item.title);
      }
    } catch { /* AJAX not available */ }
  }

  // Last-resort: fetch full listing page + client-side title filter
  if (cfg.search?.listingFallback !== false && pathPart) {
    const listingUrls = cfg.search?.listingUrl
      ? [resolveUrl(cfg.baseUrl, cfg.search.listingUrl)]
      : [`${cfg.baseUrl}/manga-list/`, `${cfg.baseUrl}/${pathPart}/`];

    for (const listingUrl of listingUrls) {
      try {
        const listHtml = await fetchText(listingUrl, getFetchOpts(cfg, "search", { retries: 1 }, signal));

        if (cfg.nextRsc) {
          const decoded = decodeNextRscStream(listHtml);
          const rscResults: SearchResult[] = [];
          const seenRscIds = new Set<string>();
          const slugRe = /"slug":"([^"]+)"/g;
          let slugMatch: RegExpExecArray | null;
          while ((slugMatch = slugRe.exec(decoded)) !== null) {
            const id = slugMatch[1];
            if (!id || seenRscIds.has(id) || RESERVED_SLUGS.has(id)) continue;
            const preCtx = decoded.slice(Math.max(0, slugMatch.index - 200), slugMatch.index);
            const nameMatches = [...preCtx.matchAll(/"(?:name|title)":"([^"]+)"/g)];
            const titleMatch = nameMatches[nameMatches.length - 1];
            if (!titleMatch?.[1]) continue;
            const title = cleanTitle(titleMatch[1], cfg);
            if (!title) continue;
            const postCtx = decoded.slice(slugMatch.index, slugMatch.index + 300);
            const coverMatch = postCtx.match(/"(?:urlImg|coverImage|cover|image|thumbnail)":"([^"]+)"/);
            const cover = proxyCover(fixUrl(processImageUrl(coverMatch?.[1] ?? "", cfg), cfg.baseUrl, cfg), cfg);
            seenRscIds.add(id);
            rscResults.push({ id, title, cover, sourceId: cfg.id });
          }
          if (rscResults.length > 0) return rscResults;
        }

        const $l = await loadHtml(listHtml);
        const listResults: SearchResult[] = [];
        const seenListIds = new Set<string>();
        $l(`a[href*="/${pathPart.replace(/["[\]\\]/g, "\\$&")}/"]`).each((_slot, el) => {
          const $anchor  = $l(el);
          const href  = $anchor.attr("href") ?? "";
          const titleAttr = $anchor.attr("title") ?? $anchor.attr("alt") ?? "";
          const titleText = $anchor.text().trim();
          if (!norm(titleAttr || titleText).includes(normalizedQuery)) return;
          const title = cleanTitle(titleAttr || titleText, cfg);
          if (!title) return;
          const id = slug(href);
          const parent = $anchor.closest("li, .bsx, .bs, .item, .bge, article");
          const searchRoot = parent.length ? parent : $anchor;
          const imgEl = searchRoot.find("img").first();
          let rawSrc = imgEl.attr("data-src") ?? imgEl.attr("src") ?? "";
          if (!rawSrc) {
            const bgEl = searchRoot.find("[style*='background-image']").first();
            const bgStyle = bgEl.attr("style") ?? "";
            const bgm = bgStyle.match(/background-image:\s*url\(['"]?([^'")\s]+)['"]?\)/);
            if (bgm) rawSrc = bgm[1];
          }
          const cover = proxyCover(fixUrl(processImageUrl(rawSrc, cfg), cfg.baseUrl, cfg), cfg);
          if (id && !seenListIds.has(id)) {
            seenListIds.add(id);
            listResults.push({
              id, title, cover, sourceId: cfg.id,
              type: sel?.seriesType ? searchRoot.find(sel.seriesType).first().text().trim() || undefined : undefined,
            });
          }
        });
        if (listResults.length > 0) return listResults;
      } catch {}
    }
  }

  return [];
}
