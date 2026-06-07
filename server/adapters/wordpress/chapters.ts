import * as cheerio from "cheerio";
import type { Chapter, SourceConfig } from "../../../shared/types.js";
import { fetchJson, fetchText } from "../../services/fetchService.js";
import { getFetchOpts, slug, ID_DATE_RE, EN_DATE_RE, parseChapterDate, derivePattern, capHtml } from "../shared.js";
import { buildChapterNumRe } from "../html/index.js";
import { rkBase, wpApiPath, seriesEndpoint, chapterEndpoint, shouldRunReaderKiru, type WpPost } from "./index.js";

async function rkChapters(cfg: SourceConfig, titleId: string, signal?: AbortSignal): Promise<Chapter[]> {
  type RkSeries = { ok: boolean; series?: { id: number } };
  const seriesRes = await fetchJson<RkSeries>(
    `${cfg.baseUrl}${rkBase(cfg)}/series/${titleId}`,
    getFetchOpts(cfg, "chapters", {
      headers: { "Accept": "application/json" },
      retries: 2
    }, signal)
  );
  const rkSeriesId = seriesRes?.series?.id;
  if (!rkSeriesId) return [];

  type RkChap = { id: number; title: string; number: number; number_raw: string; date_gmt?: string };
  type RkChapRes = { ok: boolean; chapters?: { total_pages: number; items: RkChap[] } };
  const perPage = cfg.wordpress?.chaptersPerPage ?? 100;
  const all: Chapter[] = [];
  let page = 1;
  const MAX_RK_PAGES = 200;
  while (page <= MAX_RK_PAGES) {
    if (signal?.aborted) break;
    const res = await fetchJson<RkChapRes>(
      `${cfg.baseUrl}${rkBase(cfg)}/series/${rkSeriesId}/chapters`,
      getFetchOpts(cfg, "chapters", {
        params: { per_page: perPage, order: "asc", page },
        headers: { "Accept": "application/json" },
        retries: 2
      }, signal)
    );
    const items = res?.chapters?.items ?? [];
    for (const chap of items) {
      const num = chap.number ?? Number(chap.number_raw);
      if (!chap.id || Number.isNaN(num)) continue;
      all.push({ id: String(chap.id), title: chap.title || `Chapter ${num}`, number: num, sourceId: cfg.id, titleId, chapterUpdatedAt: chap.date_gmt });
    }
    if (page >= (res?.chapters?.total_pages ?? 1) || items.length === 0) break;
    page++;
  }
  return all;
}

export async function wordpressChapters(cfg: SourceConfig, titleId: string, signal?: AbortSignal): Promise<Chapter[]> {
  const isRkEnabled = shouldRunReaderKiru(cfg);
  if (isRkEnabled) {
    try {
      const rkResult = await rkChapters(cfg, titleId, signal);
      if (rkResult.length > 0) return rkResult;
      if (cfg.wordpress?.readerKiru === true) return [];
    } catch (err) {
      if (cfg.wordpress?.readerKiru === true) throw err;
    }
  }
  if (cfg.wordpress?.readerKiru === true) return [];

  const chapNumRe  = buildChapterNumRe(cfg);
  const chapters: Chapter[] = [];

  const seriesDepth  = derivePattern(cfg.baseUrl, cfg.seriesUrl).prefix.split("/").filter(Boolean).length;
  const chapterDepth = derivePattern(cfg.baseUrl, cfg.chapterUrl).prefix.split("/").filter(Boolean).length;
  const isNestedCh   = chapterDepth > seriesDepth;

  let seriesFetchError: unknown;
  try {
    const html = capHtml(await fetchText(
      `${cfg.baseUrl}/${seriesEndpoint(cfg)}/${encodeURIComponent(titleId)}/`,
      getFetchOpts(cfg, "chapters", { retries: 1 }, signal)
    ));
    const $ = cheerio.load(html);
    const seenIds = new Set<string>();

    $("#Daftar_Chapter tr,#chapter_list li,.cl li,#chapterlist li,.eph-num," +
      ".komik_info-chapters-wrapper li,.chapterlist li," +
      ".wp-manga-chapter,.listing-chapters_wrap li").each((_slot, el) => {
      if ($(el).hasClass("premium-block")) return;
      const anchor = $(el).find("a").first();
      const href = anchor.attr("href") ?? "";
      if (!href || href === "#") return;
      const id = isNestedCh
        ? (href.startsWith("http")
            ? href.replace(cfg.baseUrl.replace(/\/$/, ""), "").replace(/^\//, "").replace(/\/$/, "")
            : href.replace(/^\//, "").replace(/\/$/, ""))
        : slug(href);
      const text = anchor.text().trim() || $(el).text().trim();
      const numMatch =
        text.match(chapNumRe) ??
        text.match(/(\d+(?:\.\d+)?)\s*$/);
      const num = numMatch ? Number(numMatch[1]) : NaN;
      if (!id || Number.isNaN(num) || seenIds.has(id)) return;
      seenIds.add(id);
      const rawDate =
        $(el).find(".tanggalseries,.chapter-date,.chapterdate,.chapter-release-date,.release-date,.item-date").first().text().trim() ||
        $(el).find("[data-date]").attr("data-date") ||
        $(el).find("abbr[title],span[title],i[title]").first().attr("title")?.trim() ||
        $(el).find("time").attr("datetime") ||
        (ID_DATE_RE.exec(text) ?? [])[0] || "";
      const chapterUpdatedAt = parseChapterDate(rawDate);
      const cleanText = text.replace(ID_DATE_RE, "").replace(EN_DATE_RE, "").replace(/\s{2,}/g, " ").trim();
      chapters.push({ id, title: cleanText || `Chapter ${num}`, number: num, sourceId: cfg.id, titleId, chapterUpdatedAt });
    });
  } catch (err) {
    seriesFetchError = err;
  }

  if (chapters.length > 0) return chapters.sort((chap1, chap2) => chap1.number - chap2.number);

  if (cfg.wordpress?.theme !== "comicsera") {
    try {
      const apiPath2 = wpApiPath(cfg);
      const postData = await fetchJson<WpPost[]>(
        `${cfg.baseUrl}${apiPath2}/${seriesEndpoint(cfg)}`,
        getFetchOpts(cfg, "chapters", {
          params: { slug: titleId, per_page: 1, _fields: "title" },
          retries: 1
        }, signal)
      );
      const postTitle = postData?.[0]?.title?.rendered?.replace(/&#\d+;/g, "'").trim() ?? "";
      if (!postTitle) throw new Error("no title");

      const perPage = cfg.wordpress?.chaptersPerPage ?? 300;
      const chapList = await fetchJson<WpPost[]>(
        `${cfg.baseUrl}${apiPath2}/${chapterEndpoint(cfg)}`,
        getFetchOpts(cfg, "chapters", {
          params: { search: postTitle, per_page: perPage, orderby: "id", order: "asc", _fields: "id,title,date_gmt" },
          retries: 2
        }, signal)
      );
      if (Array.isArray(chapList) && chapList.length > 0) {
        const postTitleLower = postTitle.toLowerCase();
        const wpChaps = chapList.map(wpChap => {
          const text = (wpChap.title?.rendered ?? "").replace(/&#\d+;/g, "'").replace(/&amp;/g, "&").trim();
          if (!text.toLowerCase().includes(postTitleLower)) return null;
          const numMatch = text.match(chapNumRe) ?? text.match(/(\d+(?:\.\d+)?)\s*$/);
          const num = numMatch ? Number(numMatch[1]) : NaN;
          if (!wpChap.id || Number.isNaN(num)) return null;
          return { id: String(wpChap.id), title: text || `Chapter ${num}`, number: num, sourceId: cfg.id, titleId, chapterUpdatedAt: wpChap.date_gmt ?? wpChap.modified_gmt };
        }).filter(Boolean) as Chapter[];
        if (wpChaps.length > 0) return wpChaps;
      }
    } catch {
      // REST API chapter post type is missing or request failed. Returns empty or partial chapter list.
    }
  }

  if (seriesFetchError !== undefined) throw seriesFetchError;

  return chapters.sort((chap1, chap2) => chap1.number - chap2.number);
}
