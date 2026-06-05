import * as cheerio from "cheerio";
import type { SearchResult, SourceConfig } from "../../../shared/types.js";
import { fetchText } from "../../services/fetchService.js";
import { LOGGER } from "../../utils/logger.js";
import {
  fixUrl, getFetchOpts, derivePattern, buildUrl, cleanTitle, proxyCover, processImageUrl, capHtml, parseChapterDate
} from "../shared.js";
import { loadHtml, buildChapterNumRe, decodeNextRscStream, extractNextRscChapters, extractAstroIslandChapters, extractAstroGenres } from "./index.js";

export async function htmlTitleInfo(cfg: SourceConfig, titleId: string): Promise<SearchResult | null> {
  try {
    const url = cfg.seriesUrl
      ? buildUrl(cfg, cfg.seriesUrl, titleId)
      : `${cfg.baseUrl}/manga/${titleId}/`;
    const html = capHtml(await fetchText(url, getFetchOpts(cfg, "search", { retries: 2 })));
    const $ = await loadHtml(html);
    const seriesPrefix = derivePattern(cfg.baseUrl, cfg.seriesUrl).prefix.replace(/^\//, "").replace(/\/$/, "");
    const { chapters: astroChaps } = extractAstroIslandChapters(html, titleId, seriesPrefix, cfg);
    const rawOgTitle = $("meta[property='og:title']").attr("content") || "";
    const ogTitle = rawOgTitle.replace(/\s*[-–]\s*.+$/, "").trim();
    const rawTitle =
      $(".komik_info-content-body-title,.entry-title").first().text().trim() ||
      $("[itemprop='name'],[itemProp='name']").first().text().trim() ||
      $("h1").first().text().trim() ||
      ogTitle ||
      titleId;
    const title = cleanTitle(rawTitle, cfg);

    const coverSelCfg = cfg.selectors?.seriesCover ?? ".series-thumb img,.komik_info-cover img,.thumb img,.cover img";
    const coverEl = $(coverSelCfg).first();
    let ldCover = "";
    $('script[type="application/ld+json"]').each((_slot, el) => {
      if (ldCover) return;
      try {
        const ld = JSON.parse($(el).html() ?? "");
        const img = ld.image ?? ld.thumbnailUrl;
        if (img && typeof img === "string") ldCover = img;
      } catch {
        // JSON-LD parsing failed, likely due to malformed or invalid structured metadata. Ignore and proceed.
      }
    });
    const astroCoverKey = cfg.selectors?.seriesCoverAstroKey;
    const astroCoverRaw = astroCoverKey ? extractAstroStringProp(html, astroCoverKey) : "";
    const cover = proxyCover(fixUrl(
      processImageUrl(
        astroCoverRaw ||
        coverEl.attr("data-src") || coverEl.attr("src") ||
        ldCover ||
        $("meta[property='og:image']").attr("content") || "",
        cfg
      ),
      cfg.baseUrl, cfg
    ), cfg);

    const descSel = cfg.selectors?.seriesDescription ??
      ".series-synops p,.komik_info-description p,.entry-content p,[class*='synopsis'] p,[class*='description'] p";
    const descParas: string[] = [];
    $(descSel).each((_slot, el) => { const paraText = $(el).text().trim(); if (paraText) descParas.push(paraText); });
    const rawOgDesc = $("meta[property='og:description']").attr("content") ?? "";
    const ogDescClean = rawOgDesc.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    const descFromHtml = descParas.find(para => (para.match(/ \/ /g) ?? []).length < 2)
      ?? descParas[0]
      ?? ogDescClean
      ?? "";
    const astroDescKey = cfg.selectors?.seriesDescriptionAstroKey;
    const descFromAstro = astroDescKey ? extractAstroStringProp(html, astroDescKey) : "";
    let description = (descFromAstro.length > descFromHtml.length ? descFromAstro : descFromHtml) || undefined;

    const chapNumRe = buildChapterNumRe(cfg);
    const chNums: number[] = [];
    $("#Daftar_Chapter tr,#chapter_list li,.cl li,.eph-num,.series-chapterlist li,a.list-chapter").each((_slot, el) => {
      const text = $(el).find("span,a").first().text().trim() || $(el).find("a").first().text().trim() || $(el).text().trim();
      const numMatch = text.match(chapNumRe) ?? text.match(/(\d+(?:\.\d+)?)\s*$/);
      if (numMatch) { const num = Number(numMatch[1]); if (!Number.isNaN(num)) chNums.push(num); }
    });
    let latestChapter = chNums.length > 0 ? Math.max(...chNums) : undefined;

    const genres: string[] = [];
    const cleanGenre = (raw: string) => raw.replace(/[,;]\s*$/, "").trim();
    const pushGenre = (raw: string) => {
      const genre = cleanGenre(raw);
      if (genre && !genres.includes(genre)) genres.push(genre);
    };
    const genreSel = cfg.selectors?.seriesGenres;
    if (genreSel) {
      $(genreSel).each((_slot, el) => pushGenre($(el).attr("title") || $(el).text()));
    } else {
      const genreSelectors = [
        ".mgen a", ".seriestugenre a", ".series-genres a", ".genres-content a",
        ".manga-genres a", "ul.genre li a span", "a.badge[href*='/genre/']", "ul.genre li a",
      ];
      for (const genreSelector of genreSelectors) {
        $(genreSelector).each((_slot, el) => pushGenre($(el).text()));
        if (genres.length > 0) break;
      }
      if (!genres.length) {
        $("meta[itemprop='genre'],a[itemprop='genre']").each((_slot, el) => {
          pushGenre($(el).attr("content") ?? $(el).text());
        });
      }
    }
    if (!genres.length) {
      for (const genre of extractAstroGenres(html)) pushGenre(genre);
    }

    let type: string | undefined;
    let alternativeTitle: string | undefined;
    const typeText = $(".series-infoz .type, .series-info .type").first().text().trim();
    if (typeText) type = typeText;
    $(".tsinfo .imptdt").each((_slot, el) => {
      const text  = $(el).text().trim();
      const label = text.split(/\s+/)[0]?.toLowerCase() ?? "";
      const fieldText   = $(el).find("a,i").first().text().trim();
      if (!fieldText) return;
      if ((label === "type" || label === "tipe") && !type) type = fieldText;
    });
    $("table.inftable tr, .imptable tr, .infotable tr, .tsinfo tr").each((_slot, tr) => {
      const label = $(tr).find("td,th").first().text().toLowerCase();
      const cell  = $(tr).find("td").last();
      if      (label.includes("alternatif") || label.includes("alternative"))
                                                                  alternativeTitle = cell.text().trim() || undefined;
      else if (label.includes("tipe") || label.includes("type")) type = type || cell.find("strong,a").first().text().trim() || cell.text().trim() || undefined;
    });
    if (!alternativeTitle) alternativeTitle = $("span.alternative").first().text().trim() || undefined;
    if (!alternativeTitle) {
      alternativeTitle = $(".seriestualt").first()
        .text().replace(/^(alt|alternative|other|judul alternatif)[\s:]+/i, "").trim() || undefined;
    }
    $(".post-status .summary-heading, .summary-heading").each((_slot, el) => {
      const heading = $(el).text().toLowerCase().trim();
      const fieldText = $(el).next(".summary-content").text().trim();
      if (!fieldText) return;
      if (heading.includes("type") && !type) type = fieldText;
      if ((heading.includes("alternative") || heading.includes("alternatif")) && !alternativeTitle)
        alternativeTitle = fieldText;
    });
    if (!alternativeTitle) {
      alternativeTitle = $(".title-alternative,.alternative-title,.other-name").first()
        .text().replace(/^(alt|alternative|other|judul alternatif)[\s:]+/i, "").trim() || undefined;
    }
    if (!alternativeTitle) {
      const txt = $(".series-titlex span, .series-title span").first().text().replace(/\s+/g, " ").trim();
      if (txt) alternativeTitle = txt || undefined;
    }
    if (!alternativeTitle) {
      const txt = $("h1.title").next("p").not("[class]").first().text().replace(/\s+/g, " ").trim();
      if (txt && !txt.toLowerCase().startsWith("followed")) alternativeTitle = txt || undefined;
    }
    if (!alternativeTitle) {
      $(".wd-full").each((_slot, el) => {
        const label = $(el).find("b").first().text().toLowerCase();
        if (label.includes("alternatif") || label.includes("alternative")) {
          alternativeTitle = alternativeTitle || $(el).find("span").first().text().trim() || undefined;
        }
      });
    }
    if (!type) type = $("meta[itemprop='additionalType']").attr("content")?.trim() || undefined;
    if (!type && cfg.selectors?.seriesType) type = $(cfg.selectors.seriesType).first().text().trim() || undefined;
    if (!alternativeTitle && cfg.selectors?.seriesAltTitle) alternativeTitle = $(cfg.selectors.seriesAltTitle).first().text().trim() || undefined;
    if (!alternativeTitle && cfg.selectors?.seriesAltTitleAstroKey) {
      const raw = extractAstroStringProp(html, cfg.selectors.seriesAltTitleAstroKey);
      if (raw) alternativeTitle = raw.replace(/\n+/g, ", ").replace(/\s*,\s*/g, ", ").trim() || undefined;
    }
    // RSC sources keep series metadata in the stream. Fill fields the selector path left empty.
    let rscSeriesUpdatedAt: string | undefined;
    if (cfg.nextRsc) {
      const rsc = extractNextRscSeriesInfo(html);
      if (!type) type = rsc.type;
      if (!alternativeTitle) alternativeTitle = rsc.alternativeTitle;
      if (!genres.length && rsc.genres) genres.push(...rsc.genres);
      if (rsc.description && rsc.description.length > (description?.length ?? 0)) description = rsc.description;
      rscSeriesUpdatedAt = rsc.seriesUpdatedAt;
      // RSC carries the chapter list, so derive latestChapter from it without a separate fetch.
      if (latestChapter === undefined) {
        const rscChapters = extractNextRscChapters(html, titleId, cfg);
        if (rscChapters.length > 0) latestChapter = Math.max(...rscChapters.map(chap => chap.number));
      }
    }

    let seriesUpdatedAt: string | undefined =
      $("meta[property='article:modified_time']").attr("content")?.trim() ||
      $("meta[property='og:updated_time']").attr("content")?.trim() ||
      // Some themes expose the date in a time[datetime] element. Prefer modified over published date.
      $("time[itemprop='dateModified']").attr("datetime")?.trim() ||
      $("time[itemprop='datePublished']").attr("datetime")?.trim() ||
      $("time[datetime]").first().attr("datetime")?.trim() ||
      rscSeriesUpdatedAt ||
      undefined;

    if (latestChapter === undefined || !seriesUpdatedAt) {
      if (astroChaps.length > 0) {
        if (latestChapter === undefined) latestChapter = Math.max(...astroChaps.map(chap => chap.number));
        if (!seriesUpdatedAt) {
          const dates = astroChaps.map(chap => chap.chapterUpdatedAt).filter((dateStr): dateStr is string => !!dateStr).sort().reverse();
          seriesUpdatedAt = dates[0];
        }
      }
    }

    // Last resort: derive seriesUpdatedAt from chapter dates when no modified-time meta exists.
    if (!seriesUpdatedAt) {
      const chapterDateSel = cfg.selectors?.chapterDate ??
        ".tanggalseries,.chapter-date,.chapterdate,.chapter-release-date,.date,.item-date,.chapter-time";
      const chapterItemSel =
        "#Daftar_Chapter tr,#chapter_list li,.cl li,.eph-num,.series-chapterlist li" +
        ",.wp-manga-chapter,.listing-chapters_wrap li" +
        ",a[href*='/chapter/'],a[href*='/read/'],a[href*='/ch/'],a[href*='/bab/']";
      const parsedDates: string[] = [];
      $(chapterItemSel).each((_slot, el) => {
        const $dateEl = $(el).find(chapterDateSel).first();
        const rawDate =
          $dateEl.text().trim() ||
          $dateEl.attr("title")?.trim() ||
          $dateEl.find("a[title]").first().attr("title")?.trim() ||
          $(el).find("p.small,p.font-italic,.release-date").first().text().trim() ||
          $(el).attr("data-date") ||
          $(el).find("[data-date]").attr("data-date") ||
          $(el).find("abbr[title],span[title],i[title]").first().attr("title")?.trim() ||
          $(el).find("time").attr("datetime") ||
          $(el).attr("datetime") || "";
        const parsed = parseChapterDate(rawDate);
        if (parsed) parsedDates.push(parsed);
      });
      if (parsedDates.length > 0) {
        parsedDates.sort().reverse();
        seriesUpdatedAt = parsedDates[0];
      }
    }

    return {
      id: titleId, title, cover, description, latestChapter, sourceId: cfg.id,
      genres: genres.length ? genres : undefined,
      type:             type             || undefined,
      alternativeTitle: alternativeTitle || undefined,
      seriesUpdatedAt:  seriesUpdatedAt  || undefined,
    };
  } catch (err) {
    LOGGER.debug("title_info_parse_failed", { sourceId: cfg.id, titleId, err: String(err) });
    return null;
  }
}

// For RSC sources, series metadata lives in the stream not the DOM. Scope scan before "chapters" array.
export function extractNextRscSeriesInfo(html: string): { alternativeTitle?: string; type?: string; genres?: string[]; description?: string; seriesUpdatedAt?: string } {
  const decoded = decodeNextRscStream(html);
  const start = decoded.indexOf('"series":{');
  if (start === -1) return {};
  const chaptersAt = decoded.indexOf('"chapters":[', start);
  const scope = decoded.slice(start, chaptersAt === -1 ? start + 6000 : chaptersAt);

  const alternativeTitle = scope.match(/"altTitle":"([^"]*)"/)?.[1]?.trim() || undefined;

  // Source enums are all-caps (MANHWA/MANGA/MANHUA). Present them title-cased for the UI.
  const rawType = scope.match(/"type":"([^"]+)"/)?.[1];
  const type = rawType ? rawType.charAt(0) + rawType.slice(1).toLowerCase() : undefined;

  const genres: string[] = [];
  const genresBlock = scope.match(/"genres":\[([^\]]*)\]/)?.[1];
  if (genresBlock) {
    for (const genreMatch of genresBlock.matchAll(/"name":"([^"]+)"/g)) {
      if (!genres.includes(genreMatch[1])) genres.push(genreMatch[1]);
    }
  }

  // After decodeNextRscStream, inner quotes are \" (one layer). Use JSON.parse to get the plain string.
  let description: string | undefined;
  const descMatch = scope.match(/"description":"((?:[^"\\]|\\.)*)"/);
  if (descMatch?.[1]) {
    try { description = (JSON.parse(`"${descMatch[1]}"`) as string).trim() || undefined; }
    catch { description = descMatch[1].replace(/\\"/g, '"').replace(/\\n/g, " ").trim() || undefined; }
  }

  // The series updatedAt precedes the chapters array in scope, so it cannot match a chapter timestamp.
  const seriesUpdatedAt = scope.match(/"updatedAt":"([^"]+)"/)?.[1] || undefined;

  return { alternativeTitle, type, genres: genres.length ? genres : undefined, description, seriesUpdatedAt };
}

export function extractAstroStringProp(html: string, propKey: string): string {
  const islandRe = /props="([^"]+)"/g;
  const escapedKey = propKey.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const propRe = new RegExp(`"${escapedKey}":\\[0,"((?:[^"\\\\]|\\\\.){10,})"`);
  let best = "";
  let match: RegExpExecArray | null;
  while ((match = islandRe.exec(html)) !== null) {
    const decoded = match[1].replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&#34;/g, '"');
    const propMatch = propRe.exec(decoded);
    if (propMatch && propMatch[1].length > best.length) best = propMatch[1];
  }
  if (!best) return "";
  const decodedContent = best
    .replace(/\\n/g, "\n").replace(/\\"/g, '"')
    .replace(/\\u003c/g, "<").replace(/\\u003e/g, ">").replace(/\\u0026/g, "&")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'").replace(/&#34;/g, '"').replace(/&quot;/g, '"');
  const pMatches = [...decodedContent.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)];
  if (pMatches.length > 0) {
    const parts: string[] = [];
    for (const pm of pMatches) {
      if (/^\s*<strong/i.test(pm[1])) break;
      const text = cheerio.load(pm[0]).text().trim();
      if (text) parts.push(text);
    }
    if (parts.length > 0) return parts.join(" ").replace(/\s{2,}/g, " ").trim();
  }
  return decodedContent.replace(/<[^>]+>/g, " ").replace(/\s{2,}/g, " ").trim();
}
