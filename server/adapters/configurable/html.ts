import * as cheerio from "cheerio";
import { fetchJson, fetchText } from "../../services/fetchService.js";
import type { Chapter, Page, SearchResult, SourceConfig } from "../../../shared/types.js";
import {
  slug, fixUrl, makeHeaders, getTimeout, getFetchOpts, derivePattern, buildUrl,
  extractTsReaderImages, cleanTitle, proxyCover, proxyPageImage,
  processImageUrl, ID_DATE_RE, ID_DATE_DMY_RE, EN_DATE_RE, DMY_DATE_RE, parseChapterDate
} from "./shared.js";

// Default CSS selector lists used when cfg.selectors.* is not set
const DEFAULT_SEARCH_ITEM =
  ".bsx,.bs,.bge,.item,.manga-item,.comic-item,article.post,.list-update_item" +
  ",.page-item-detail,.c-tabs-item,.tab-item,.manga_new";
const DEFAULT_SEARCH_TITLE = ".tt,.title,h3,h2,.post-title,[class*='title']";
const DEFAULT_SEARCH_COVER = "img";
const DEFAULT_CHAPTER_ITEM =
  "a.list-chapter,#Daftar_Chapter tr,#chapter_list li,.cl li,#chapterlist li,.eph-num" +
  ",.wp-manga-chapter,.listing-chapters_wrap li,.series-chapterlist li";
const DEFAULT_PAGE_IMAGE =
  "#Baca_Komik img,.ts-main-image,#readerarea img,.reading-content img" +
  ",.main-reading-area img,#chapter_body img,#chapter-images img,.reader-area img";
const DEFAULT_IMAGE_EXTENSIONS = ["jpg", "jpeg", "png", "webp", "gif"];
const DEFAULT_IMAGE_EXCLUDE = ["logo", "icon", "avatar"];
const DEFAULT_CHAPTER_NUM_RE = /(?:chapter|ch|bab|episode|ep)[.\s#-]*(\d+(?:\.\d+)?)/i;
const RESERVED_SLUGS = new Set(["manga", "manhwa", "manhua", "komik", "webtoon", "novel", "search", "page"]);

function buildChapterNumRe(cfg: SourceConfig): RegExp {
  if (cfg.chapterNumberPattern) {
    try { return new RegExp(cfg.chapterNumberPattern, "i"); } catch { /* fall through */ }
  }
  return DEFAULT_CHAPTER_NUM_RE;
}

function imageExtRe(cfg: SourceConfig): RegExp {
  const exts = cfg.imageExtensions ?? DEFAULT_IMAGE_EXTENSIONS;
  return new RegExp(`\\.(${exts.join("|")})`, "i");
}

function isExcludedImage(src: string, cfg: SourceConfig): boolean {
  const kw = cfg.imageExcludeKeywords ?? DEFAULT_IMAGE_EXCLUDE;
  return kw.some(k => src.includes(k));
}

export async function htmlSearch(cfg: SourceConfig, query: string): Promise<SearchResult[]> {
  const seriesPattern = derivePattern(cfg.baseUrl, cfg.seriesUrl);
  const pathPart = seriesPattern.prefix.replace(/^\//, "").replace(/\/$/, "");
  const enc = encodeURIComponent(query);

  // Build search URL list; cfg.searchEndpoints replaces the entire list if provided
  let urls: string[];
  if (cfg.searchEndpoints && cfg.searchEndpoints.length > 0) {
    urls = cfg.searchEndpoints.map(t =>
      t.replace("{base}", cfg.baseUrl).replace("{q}", enc)
       .replace("{searchParam}", cfg.searchParam ?? "s")
    );
  } else {
    urls = [
      `${cfg.baseUrl}/?s=${enc}`,
      `${cfg.baseUrl}/?s=${enc}&post_type=wp-manga`,
      `${cfg.baseUrl}/search?q=${enc}`,
      `${cfg.baseUrl}/search?keyword=${enc}`
    ];
    if (cfg.searchParam) {
      urls.unshift(`${cfg.baseUrl}/advanced-search/?${cfg.searchParam}=${enc}`);
    } else {
      urls.push(`${cfg.baseUrl}/advanced-search/?search_term=${enc}`);
    }
  }

  const sel = cfg.selectors;
  const searchItemSel  = sel?.searchItem  ?? DEFAULT_SEARCH_ITEM;
  const searchTitleSel = sel?.searchTitle ?? DEFAULT_SEARCH_TITLE;
  const imageAttr      = sel?.imageAttr;
  const chapNumRe      = buildChapterNumRe(cfg);

  for (const url of urls) {
    try {
      const html = await fetchText(url, { ...getFetchOpts(cfg, "search", { retries: 1 }), noCircuit: true });
      const $ = cheerio.load(html);
      const results: SearchResult[] = [];

      $(searchItemSel).each((_, el) => {
        const a = $(el).find("a").first();
        const href = a.attr("href") ?? "";
        const id = slug(href);
        const rawTitle =
          $(el).find(searchTitleSel).first().text().trim() ||
          a.attr("title") || "";
        const title = cleanTitle(rawTitle, cfg);
        const imgEl = $(el).find(sel?.searchCover ?? DEFAULT_SEARCH_COVER).first();
        const rawSrc = imageAttr
          ? (imgEl.attr(imageAttr) ?? "")
          : (imgEl.attr("data-src") ?? imgEl.attr("data-lazy-src") ?? imgEl.attr("src") ?? "");
        const cover = proxyCover(fixUrl(processImageUrl(rawSrc, cfg), cfg.baseUrl, cfg), cfg);
        const epxsSel = sel?.searchLatestChapter ?? ".epxs,.ep-date,.eph-num,.chapternum,.chapter-item,.tray-item";
        const epxsText = $(el).find(epxsSel).first().text().trim();
        const chMatch = epxsText.match(chapNumRe) ?? epxsText.match(/(\d+(?:\.\d+)?)\s*$/);
        const latestChapter = chMatch ? Number(chMatch[1]) : undefined;
        if (id && !RESERVED_SLUGS.has(id) && title && !results.find(r => r.id === id))
          results.push({ id, title, cover, latestChapter, sourceId: cfg.id });
      });

      if (results.length === 0 && pathPart) {
        $(`a[href*='/${pathPart}/']`).each((_, el) => {
          const href = $(el).attr("href") ?? "";
          if (!href.includes(`/${pathPart}/`)) return;
          const id = slug(href);
          const rawTitle =
            $(el).find("img").attr("alt") ||
            $(el).find("[class*='title'],h3,h2").first().text().trim() ||
            $(el).attr("title") || $(el).text().trim();
          const title = cleanTitle(rawTitle, cfg);
          const imgEl = $(el).find("img").first();
          const rawSrc = imgEl.attr("data-src") ?? imgEl.attr("src") ?? "";
          const cover = proxyCover(fixUrl(processImageUrl(rawSrc, cfg), cfg.baseUrl, cfg), cfg);
          if (id && title && !results.find(r => r.id === id))
            results.push({ id, title, cover, sourceId: cfg.id });
        });
      }

      if (results.length > 0) return results;
    } catch { /* try next URL */ }
  }

  // AJAX search fallback (many sites don't include results in initial HTML)
  if (cfg.searchAjaxFallback !== false) {
    try {
      type MadaraHit = { url?: string; title?: string; thumb?: string };
      type MadaraRes = { success: boolean; data?: MadaraHit[] };
      const ajaxRes = await fetchJson<MadaraRes>(
        `${cfg.baseUrl}/wp-admin/admin-ajax.php`,
        {
          ...getFetchOpts(cfg, "search", {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            data: `action=wp-manga-search-manga&title=${enc}`,
            retries: 1
          }),
          noCircuit: true
        }
      );
      if (ajaxRes.success && Array.isArray(ajaxRes.data) && ajaxRes.data.length > 0) {
        return ajaxRes.data.map(item => ({
          id:    slug(item.url ?? ""),
          title: item.title ?? "",
          cover: fixUrl(item.thumb ?? "", cfg.baseUrl),
          sourceId: cfg.id
        })).filter(r => r.id && r.title);
      }
    } catch { /* AJAX not available */ }
  }

  // Last-resort: fetch full listing page + client-side title filter
  if (cfg.searchListingFallback !== false && pathPart) {
    const listingUrls = cfg.listingUrl
      ? [cfg.listingUrl]
      : [`${cfg.baseUrl}/manga-list/`, `${cfg.baseUrl}/${pathPart}/`];

    for (const listingUrl of listingUrls) {
      try {
        const listHtml = await fetchText(listingUrl, { ...getFetchOpts(cfg, "search", { retries: 1 }), noCircuit: true });
        const $l = cheerio.load(listHtml);
        const norm = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[\u2018\u2019`\u00B4\u201A\u201B]/g, "'");
        const q = norm(query);
        const listResults: SearchResult[] = [];
        $l(`a[href*='/${pathPart}/']`).each((_, el) => {
          const $a  = $l(el);
          const href  = $a.attr("href") ?? "";
          const title = $a.text().trim();
          if (!title || !norm(title).includes(q)) return;
          const id = slug(href);
          const parent = $a.closest("li, .bsx, .bs, .item, .bge, article");
          const imgEl = parent.find("img").first();
          const rawSrc = imgEl.attr("data-src") ?? imgEl.attr("src") ?? "";
          const cover = proxyCover(fixUrl(processImageUrl(rawSrc, cfg), cfg.baseUrl, cfg), cfg);
          if (id && !listResults.find(r => r.id === id))
            listResults.push({ id, title, cover, sourceId: cfg.id });
        });
        if (listResults.length > 0) return listResults;
      } catch { /* try next listing URL */ }
    }
  }

  return [];
}

export async function htmlChapters(cfg: SourceConfig, titleId: string): Promise<Chapter[]> {
  const url = buildUrl(cfg, cfg.seriesUrl, titleId);
  const html = await fetchText(url, getFetchOpts(cfg, "chapters", { retries: 2 }));
  const $ = cheerio.load(html);
  const chapters: Chapter[] = [];

  const chapterPattern = derivePattern(cfg.baseUrl, cfg.chapterUrl);
  const chPathPart = chapterPattern.prefix.replace(/^\//, "").replace(/\/$/, "");
  const seriesPathDepth  = derivePattern(cfg.baseUrl, cfg.seriesUrl).prefix.split("/").filter(Boolean).length;
  const chapterPathDepth = chapterPattern.prefix.split("/").filter(Boolean).length;
  const isNestedChapter  = cfg.nestedChapterIds ?? (chapterPathDepth > seriesPathDepth);

  const autoSel = isNestedChapter
    ? `a[href*='/${titleId}/']`
    : chPathPart
      ? `a[href*='/${chPathPart}/']`
      : "a[href*='/chapter/'],a[href*='/ch/'],a[href*='/bab/']";

  const chapterItemSel = cfg.selectors?.chapterItem ?? DEFAULT_CHAPTER_ITEM;
  const chapterLinkSel = cfg.selectors?.chapterLink ?? "a";
  const chapterDateSel = cfg.selectors?.chapterDate ?? ".tanggalseries,.chapter-date,.chapterdate,.chapter-release-date,.date,.item-date,.chapter-time";
  const chapNumRe      = buildChapterNumRe(cfg);

  const combinedSel = [chapterItemSel, autoSel].join(",");

  $(combinedSel).each((_, el) => {
    const a = (el as { tagName?: string }).tagName === "a"
      ? $(el)
      : $(el).find(chapterLinkSel).first();
    const href = a.attr("href") ?? "";
    if (!href) return;
    const chSlug = slug(href);
    const id = isNestedChapter
      ? (href.startsWith("http")
          ? href.replace(cfg.baseUrl.replace(/\/$/, ""), "").replace(/^\//, "").replace(/\/$/, "")
          : href.replace(/^\//, "").replace(/\/$/, ""))
      : chSlug;
    
    const titleEl = cfg.selectors?.chapterTitle
      ? (a.find(cfg.selectors.chapterTitle).first().text().trim() || $(el).find(cfg.selectors.chapterTitle).first().text().trim())
      : "";
    const text = titleEl || a.text().trim() || $(el).text().trim();
    const numMatch =
      text.match(chapNumRe) ??
      text.match(/(\d+(?:\.\d+)?)\s*$/);
    const num = numMatch ? Number(numMatch[1]) : NaN;
    if (!id || Number.isNaN(num)) return;
    const $dateEl = $(el).find(chapterDateSel).first();
    const rawDate =
      $dateEl.text().trim() ||
      $dateEl.attr("title")?.trim() ||
      $(el).find("p.small,p.font-italic,.release-date").first().text().trim() ||
      $(el).find("[data-date]").attr("data-date") ||
      $(el).find("abbr[title],span[title],i[title]").first().attr("title")?.trim() ||
      $(el).find("time").attr("datetime") ||
      (ID_DATE_DMY_RE.exec(text) ?? [])[0] ||
      (ID_DATE_RE.exec(text) ?? [])[0] ||
      (EN_DATE_RE.exec(text) ?? [])[0] || "";
    const chapterUpdatedAt = parseChapterDate(rawDate);
    const existing = chapters.find(c => c.id === id);
    if (existing) {
      if (!existing.chapterUpdatedAt && chapterUpdatedAt) existing.chapterUpdatedAt = chapterUpdatedAt;
      return;
    }
    const cleanText = (rawDate ? text.replace(rawDate, "") : text)
      .replace(ID_DATE_DMY_RE, "").replace(ID_DATE_RE, "").replace(EN_DATE_RE, "").replace(DMY_DATE_RE, "")
      .replace(/^(?:New|First|Latest|Hot)\s+Chapter\b\s*/i, "")
      .replace(/\s{2,}/g, " ").trim();
    chapters.push({ id, title: cleanText || `Chapter ${num}`, number: num, sourceId: cfg.id, titleId, chapterUpdatedAt });
  });

  return chapters.sort((a, b) => a.number - b.number);
}

export async function htmlPages(cfg: SourceConfig, chapterId: string): Promise<Page[]> {
  const compSep = chapterId.indexOf("/");
  const url = compSep !== -1
    ? `${cfg.baseUrl.replace(/\/$/, "")}/${chapterId}${cfg.chapterUrl.endsWith("/") ? "/" : ""}`
    : buildUrl(cfg, cfg.chapterUrl, chapterId);
  const html = await fetchText(url, getFetchOpts(cfg, "pages", { retries: 2 }));

  const tsPages = extractTsReaderImages(html, chapterId);
  if (tsPages) return tsPages.map(p => ({ ...p, imageUrl: proxyPageImage(processImageUrl(p.imageUrl, cfg), cfg) }));

  const $ = cheerio.load(html);
  const images: string[] = [];
  const extRe  = imageExtRe(cfg);
  const imgAttr = cfg.selectors?.imageAttr;
  const pageImageSel = cfg.selectors?.pageImage ?? DEFAULT_PAGE_IMAGE;

  $(pageImageSel).each((_, el) => {
    const src = imgAttr
      ? ($(el).attr(imgAttr) ?? "")
      : ($(el).attr("data-src") ?? $(el).attr("data-lazy-src") ?? $(el).attr("src") ?? "");
    if (src && !src.includes("data:image") && src.match(extRe)) {
      const wAttr = $(el).attr("width");
      if (wAttr) {
        const w = parseInt(wAttr, 10);
        if (!isNaN(w) && w < (cfg.imageMinWidth ?? 100)) return;
      }
      images.push(fixUrl(processImageUrl(src, cfg), cfg.baseUrl, cfg));
    }
  });

  // lozad lazy-loading; CDN URLs may have no file extension
  if (images.length === 0) {
    $("#content-reader img[data-src], .carousel-item img[data-src]").each((_, el) => {
      const src = $(el).attr("data-src") ?? "";
      if (src && src.startsWith("http")) images.push(processImageUrl(src, cfg));
    });
  }

  if (images.length === 0) {
    $("img").each((_, el) => {
      const src = $(el).attr("data-src") ?? $(el).attr("src") ?? "";
      if (src && src.match(extRe) && !isExcludedImage(src, cfg)) {
        const wAttr = $(el).attr("width");
        if (wAttr) {
          const w = parseInt(wAttr, 10);
          if (!isNaN(w) && w < (cfg.imageMinWidth ?? 100)) return;
        }
        images.push(fixUrl(processImageUrl(src, cfg), cfg.baseUrl, cfg));
      }
    });
  }

  return images.map((imageUrl, i) => ({ chapterId, imageUrl: proxyPageImage(imageUrl, cfg), index: i }));
}

export async function htmlTitleInfo(cfg: SourceConfig, titleId: string): Promise<SearchResult | null> {
  try {
    const url = cfg.seriesUrl
      ? buildUrl(cfg, cfg.seriesUrl, titleId)
      : `${cfg.baseUrl}/manga/${titleId}/`;
    const html = await fetchText(url, getFetchOpts(cfg, "chapters", { retries: 2 }));
    const $ = cheerio.load(html);
    const rawOgTitle = $("meta[property='og:title']").attr("content") || "";
    const ogTitle = rawOgTitle.replace(/\s*[-\u2013]\s*.+$/, "").trim();
    const rawTitle =
      $(".komik_info-content-body-title,.entry-title").first().text().trim() ||
      $("h1").first().text().trim() ||
      ogTitle ||
      titleId;
    const title = cleanTitle(rawTitle, cfg);

    const coverSelCfg = cfg.selectors?.seriesCover ?? ".series-thumb img,.komik_info-cover img,.thumb img,.cover img";
    const coverEl = $(coverSelCfg).first();
    const cover = proxyCover(fixUrl(
      processImageUrl(
        coverEl.attr("data-src") || coverEl.attr("src") ||
        $("meta[property='og:image']").attr("content") || "",
        cfg
      ),
      cfg.baseUrl, cfg
    ), cfg);

    const descSel = cfg.selectors?.seriesDescription ??
      ".series-synops p,.komik_info-description p,.entry-content p,[class*='synopsis'] p,[class*='description'] p";
    const description =
      $(descSel).first().text().trim() ||
      $("meta[property='og:description']").attr("content") ||
      undefined;

    const chapNumRe = buildChapterNumRe(cfg);
    const chNums: number[] = [];
    $("#Daftar_Chapter tr,#chapter_list li,.cl li,.eph-num,.series-chapterlist li,a.list-chapter").each((_, el) => {
      const text = $(el).find("span,a").first().text().trim() || $(el).find("a").first().text().trim() || $(el).text().trim();
      const m = text.match(chapNumRe) ?? text.match(/(\d+(?:\.\d+)?)\s*$/);
      if (m) { const n = Number(m[1]); if (!Number.isNaN(n)) chNums.push(n); }
    });
    const latestChapter = chNums.length > 0 ? Math.max(...chNums) : undefined;

    const genres: string[] = [];
    const genreSel = cfg.selectors?.seriesGenres;
    if (genreSel) {
      $(genreSel).each((_, el) => {
        const g = $(el).text().trim();
        if (g && !genres.includes(g)) genres.push(g);
      });
    } else {
      const genreSelectors = [
        ".mgen a", ".seriestugenre a", ".series-genres a", ".genres-content a",
        ".manga-genres a", "ul.genre li a span", "a.badge[href*='/genre/']", "ul.genre li a",
      ];
      for (const sel of genreSelectors) {
        $(sel).each((_, el) => {
          const g = $(el).text().trim();
          if (g && !genres.includes(g)) genres.push(g);
        });
        if (genres.length > 0) break;
      }
      if (!genres.length) {
        $("meta[itemprop='genre']").each((_, el) => {
          const g = $(el).attr("content")?.trim() ?? "";
          if (g && !genres.includes(g)) genres.push(g);
        });
      }
    }

    let type: string | undefined;
    let alternativeTitle: string | undefined;
    const t = $(".series-infoz .type, .series-info .type").first().text().trim();
    if (t) type = t;
    $(".tsinfo .imptdt").each((_, el) => {
      const text  = $(el).text().trim();
      const label = text.split(/\s+/)[0]?.toLowerCase() ?? "";
      const val   = $(el).find("a,i").first().text().trim();
      if (!val) return;
      if ((label === "type" || label === "tipe") && !type) type = val;
    });
    $("table.inftable tr, .imptable tr, .infotable tr, .tsinfo tr").each((_, tr) => {
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
    if (!type) {
      $(".post-status .summary-heading, .summary-heading").each((_, el) => {
        const heading = $(el).text().toLowerCase().trim();
        const val = $(el).next(".summary-content").text().trim();
        if (!val) return;
        if (heading.includes("type") && !type) type = val;
      });
    }
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
      $(".wd-full").each((_, el) => {
        const label = $(el).find("b").first().text().toLowerCase();
        if (label.includes("alternatif") || label.includes("alternative")) {
          alternativeTitle = alternativeTitle || $(el).find("span").first().text().trim() || undefined;
        }
      });
    }
    if (!type) type = $("meta[itemprop='additionalType']").attr("content")?.trim() || undefined;
    const seriesUpdatedAt =
      $("meta[property='article:modified_time']").attr("content")?.trim() ||
      $("meta[property='og:updated_time']").attr("content")?.trim() ||
      undefined;

    return {
      id: titleId, title, cover, description, latestChapter, sourceId: cfg.id,
      genres: genres.length ? genres : undefined,
      type:             type             || undefined,
      alternativeTitle: alternativeTitle || undefined,
      seriesUpdatedAt:  seriesUpdatedAt  || undefined,
    };
  } catch { return null; }
}
