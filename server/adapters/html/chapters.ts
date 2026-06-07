import type { Chapter, SourceConfig } from "../../../shared/types.js";
import { fetchText } from "../../services/fetchService.js";
import {
  slug, getFetchOpts, derivePattern, buildUrl,
  ID_DATE_RE, ID_DATE_DMY_RE, EN_DATE_RE, DMY_DATE_RE, parseChapterDate, capHtml
} from "../shared.js";
import { loadHtml, buildChapterNumRe, extractNextRscChapters, extractAstroIslandChapters } from "./index.js";

const DEFAULT_CHAPTER_ITEM =
  "a.list-chapter,#Daftar_Chapter tr,#chapter_list li,.cl li,#chapterlist li,.eph-num" +
  ",.wp-manga-chapter,.listing-chapters_wrap li,.series-chapterlist li";

function escapeCssAttrValue(str: string): string {
  return str.replace(/["[\]\\]/g, "\\$&");
}

export async function htmlChapters(cfg: SourceConfig, titleId: string, signal?: AbortSignal): Promise<Chapter[]> {
  const url = buildUrl(cfg, cfg.seriesUrl, titleId) + (cfg.chapterListAppend ?? "");
  const rawHtml = await fetchText(url, getFetchOpts(cfg, "chapters", { retries: 2 }, signal));

  if (cfg.nextRsc) {
    const rscChapters = extractNextRscChapters(rawHtml, titleId, cfg);
    if (rscChapters.length > 0) return rscChapters;
  }

  const seriesPrefix = derivePattern(cfg.baseUrl, cfg.seriesUrl).prefix.replace(/^\//, "").replace(/\/$/, "");

  const { chapters: astroChapters, hasAccessibilityData } = extractAstroIslandChapters(rawHtml, titleId, seriesPrefix, cfg);
  if (astroChapters.length > 0 && hasAccessibilityData) {
    return astroChapters.sort((chap1, chap2) => chap1.number - chap2.number);
  }

  const html = cfg.chapterListAppend ? rawHtml : capHtml(rawHtml);
  const $ = await loadHtml(html);
  const chapters: Chapter[] = [];

  const chapterPattern = derivePattern(cfg.baseUrl, cfg.chapterUrl);
  const chPathPart = chapterPattern.prefix.replace(/^\//, "").replace(/\/$/, "");
  const seriesPathDepth  = derivePattern(cfg.baseUrl, cfg.seriesUrl).prefix.split("/").filter(Boolean).length;
  const chapterPathDepth = chapterPattern.prefix.split("/").filter(Boolean).length;
  const isNestedChapter  = cfg.nestedChapterIds ?? (chapterPathDepth > seriesPathDepth);

  const safeId   = escapeCssAttrValue(titleId);
  const safePath = escapeCssAttrValue(chPathPart);
  const autoSel = isNestedChapter
    ? `a[href*="/${safeId}/"]`
    : chPathPart
      ? `a[href*="/${safePath}/"]`
      : "a[href*='/chapter/'],a[href*='/ch/'],a[href*='/bab/']";

  const chapterItemSel = cfg.selectors?.chapterItem ?? DEFAULT_CHAPTER_ITEM;
  const chapterLinkSel = cfg.selectors?.chapterLink ?? "a";
  const chapterDateSel = cfg.selectors?.chapterDate ?? ".tanggalseries,.chapter-date,.chapterdate,.chapter-release-date,.date,.item-date,.chapter-time";
  const chapNumRe      = buildChapterNumRe(cfg);

  const combinedSel = [chapterItemSel, autoSel].join(",");
  const seenIds = new Set<string>();

  $(combinedSel).each((_slot, el) => {
    const anchor = (el as { tagName?: string }).tagName === "a"
      ? $(el)
      : $(el).find(chapterLinkSel).first();
    const href = anchor.attr("href") ?? (cfg.selectors?.chapterHrefAttr ? ($(el).attr(cfg.selectors.chapterHrefAttr) ?? "") : "");
    if (!href) return;
    const lockedSel = cfg.selectors?.chapterItemLocked;
    if (lockedSel && ($(el).find(lockedSel).length > 0 || $(el).is(lockedSel))) return;
    const chSlug = slug(href);
    const id = isNestedChapter
      ? (href.startsWith("http")
          ? href.replace(cfg.baseUrl.replace(/\/$/, ""), "").replace(/^\//, "").replace(/\/$/, "")
          : href.replace(/^\//, "").replace(/\/$/, ""))
      : chSlug;

    const titleEl = cfg.selectors?.chapterTitle
      ? (anchor.find(cfg.selectors.chapterTitle).first().text().trim() || $(el).find(cfg.selectors.chapterTitle).first().text().trim())
      : "";
    const text = titleEl || anchor.text().trim() || $(el).text().trim();
    const numMatch =
      text.match(chapNumRe) ??
      text.match(/(\d+(?:\.\d+)?)\s*$/);
    let num = numMatch ? Number(numMatch[1]) : NaN;
    if (Number.isNaN(num)) {
      const slugNumMatch = chSlug.match(/(\d+(?:\.\d+)?)\s*$/);
      if (slugNumMatch) num = Number(slugNumMatch[1]);
    }
    if (!id || Number.isNaN(num)) return;
    const $dateEl = $(el).find(chapterDateSel).first();
    const rawDate =
      (cfg.selectors?.chapterDateAttr ? ($dateEl.attr(cfg.selectors.chapterDateAttr) ?? anchor.attr(cfg.selectors.chapterDateAttr) ?? $(el).attr(cfg.selectors.chapterDateAttr) ?? "") : "") ||
      $dateEl.text().trim() ||
      $dateEl.attr("title")?.trim() ||
      $dateEl.find("a[title]").first().attr("title")?.trim() ||
      $(el).find("p.small,p.font-italic,.release-date").first().text().trim() ||
      $(el).find("[data-date]").attr("data-date") ||
      $(el).find("abbr[title],span[title],i[title]").first().attr("title")?.trim() ||
      $(el).find("time").attr("datetime") ||
      (ID_DATE_DMY_RE.exec(text) ?? [])[0] ||
      (ID_DATE_RE.exec(text) ?? [])[0] ||
      (EN_DATE_RE.exec(text) ?? [])[0] || "";
    const chapterUpdatedAt = parseChapterDate(rawDate);
    if (seenIds.has(id)) {
      if (chapterUpdatedAt) {
        const existing = chapters.find(chapter => chapter.id === id);
        if (existing && !existing.chapterUpdatedAt) existing.chapterUpdatedAt = chapterUpdatedAt;
      }
      return;
    }
    seenIds.add(id);
    const cleanText = (rawDate ? text.replace(rawDate, "") : text)
      .replace(ID_DATE_DMY_RE, "").replace(ID_DATE_RE, "").replace(EN_DATE_RE, "").replace(DMY_DATE_RE, "")
      .replace(/^(?:New|First|Latest|Hot)\s+Chapter\b\s*/i, "")
      .replace(/\s{2,}/g, " ").trim();
    chapters.push({ id, title: cleanText || `Chapter ${num}`, number: num, sourceId: cfg.id, titleId, chapterUpdatedAt });
  });

  if (astroChapters.length > 0 && astroChapters.length > chapters.length) {
    return astroChapters.sort((chap1, chap2) => chap1.number - chap2.number);
  }

  return chapters.sort((chap1, chap2) => chap1.number - chap2.number);
}
