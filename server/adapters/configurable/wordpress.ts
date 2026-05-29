import * as cheerio from "cheerio";
import { fetchJson, fetchText } from "../../services/fetchService.js";
import type { Chapter, Page, SearchResult, SourceConfig } from "../../../shared/types.js";
import { fixUrl, makeHeaders, getTimeout, getFetchOpts, slug, extractTsReaderImages, proxyCover, proxyPageImage, processImageUrl, ID_DATE_RE, parseChapterDate } from "./shared.js";
import { htmlTitleInfo } from "./html.js";

/** Process items in sequential batches to avoid flooding the source server. */
async function batchAllSettled<T>(items: T[], fn: (item: T) => Promise<T>, size = 5): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < items.length; i += size) {
    const batch = items.slice(i, i + size);
    const settled = await Promise.allSettled(batch.map(fn));
    out.push(...settled.map((r, j) => (r.status === "fulfilled" ? r.value : batch[j])));
  }
  return out;
}

type WpPost = {
  id?: number;
  slug: string;
  title: { rendered: string };
  link: string;
  excerpt?: { rendered: string };
  content?: { rendered: string };
  yoast_head?: string;
  modified_gmt?: string;
  class_list?: string[];
};

function extractYoastCover(yoastHead: string | undefined): string {
  if (!yoastHead) return "";
  const m = yoastHead.match(/og:image[^>]+content="(https?:\/\/[^"]+)"/);
  return m ? m[1] : "";
}

function rkBase(cfg: SourceConfig): string {
  return (cfg.wpReaderKiruPath ?? "/wp-json/readerkiru/v1").replace(/\/$/, "");
}

function wpApiPath(cfg: SourceConfig): string {
  return (cfg.wpApiPath ?? "/wp-json/wp/v2").replace(/\/$/, "");
}

function mangaEndpoint(cfg: SourceConfig): string {
  return cfg.wpMangaEndpoint ?? "manga";
}

function chapterEndpoint(cfg: SourceConfig): string {
  return cfg.wpChapterEndpoint ?? "chapter";
}

function shouldRunReaderKiru(cfg: SourceConfig): boolean {
  if (cfg.wpSkipReaderKiru) return false;
  if (cfg.wpReaderKiru === false) return false;
  return true;
}

async function rkSearch(cfg: SourceConfig, query: string): Promise<SearchResult[]> {
  type RkItem = { id: number; title: string; slug: string; cover?: string; latest_chapters?: { number: number }[] };
  type RkRes = { ok: boolean; items?: RkItem[] };
  const limit = cfg.searchLimit ?? 40;
  const r = await fetchJson<RkRes>(
    `${cfg.baseUrl}${rkBase(cfg)}/search/series`,
    getFetchOpts(cfg, "search", {
      params: { q: query, per_page: limit },
      headers: { "Accept": "application/json" },
      retries: 2
    })
  );
  if (!r?.ok || !Array.isArray(r.items) || r.items.length === 0) return [];
  const base: SearchResult[] = r.items.map(item => ({
    id:            item.slug ?? String(item.id),
    title:         item.title,
    cover:         proxyCover(fixUrl(item.cover ?? "", cfg.baseUrl, cfg), cfg),
    latestChapter: item.latest_chapters?.[0]?.number,
    sourceId:      cfg.id,
  })).filter(r => r.id && r.title) as SearchResult[];

  // Enrich only the first 10 results to avoid flooding the source with detail calls.
  const enrichLimit = Math.min(base.length, 10);
  const batchSize = cfg.wpCoverBatchSize ?? 3;
  const enriched = await batchAllSettled(base.slice(0, enrichLimit), async (result) => {
    const full = await rkSeriesDetail(cfg, result.id);
    return full ?? result;
  }, batchSize);
  return [...enriched, ...base.slice(enrichLimit)];
}

async function rkChapters(cfg: SourceConfig, titleId: string): Promise<Chapter[]> {
  type RkSeries = { ok: boolean; series?: { id: number } };
  const seriesRes = await fetchJson<RkSeries>(
    `${cfg.baseUrl}${rkBase(cfg)}/series/${titleId}`,
    getFetchOpts(cfg, "chapters", {
      headers: { "Accept": "application/json" },
      retries: 2
    })
  );
  const rkSeriesId = seriesRes?.series?.id;
  if (!rkSeriesId) return [];

  type RkChap = { id: number; title: string; number: number; number_raw: string; date_gmt?: string };
  type RkChapRes = { ok: boolean; chapters?: { total_pages: number; items: RkChap[] } };
  const perPage = cfg.wpChaptersPerPage ?? 100;
  const all: Chapter[] = [];
  let page = 1;
  while (true) {
    const res = await fetchJson<RkChapRes>(
      `${cfg.baseUrl}${rkBase(cfg)}/series/${rkSeriesId}/chapters`,
      getFetchOpts(cfg, "chapters", {
        params: { per_page: perPage, order: "asc", page },
        headers: { "Accept": "application/json" },
        retries: 2
      })
    );
    const items = res?.chapters?.items ?? [];
    for (const c of items) {
      const num = c.number ?? Number(c.number_raw);
      if (!c.id || Number.isNaN(num)) continue;
      all.push({ id: String(c.id), title: c.title || `Chapter ${num}`, number: num, sourceId: cfg.id, titleId, chapterUpdatedAt: c.date_gmt });
    }
    if (page >= (res?.chapters?.total_pages ?? 1) || items.length === 0) break;
    page++;
  }
  return all;
}

async function rkPages(cfg: SourceConfig, chapterId: string): Promise<Page[]> {
  type RkImg = { page: number; url: string };
  type RkPageRes = { ok: boolean; images?: RkImg[] };
  const r = await fetchJson<RkPageRes>(
    `${cfg.baseUrl}${rkBase(cfg)}/chapter/${chapterId}`,
    getFetchOpts(cfg, "pages", {
      headers: { "Accept": "application/json" },
      retries: 2
    })
  );
  if (!r?.ok || !Array.isArray(r.images) || r.images.length === 0) return [];
  return r.images.map((img, i) => {
    const imageUrl = img.url.startsWith("http") ? img.url : `https:${img.url}`;
    return { chapterId, imageUrl: proxyPageImage(processImageUrl(imageUrl, cfg), cfg), index: i };
  });
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

async function rkSeriesDetail(cfg: SourceConfig, titleId: string): Promise<SearchResult | null> {
  const r = await fetchJson<RkSeriesResponse>(
    `${cfg.baseUrl}${rkBase(cfg)}/series/${titleId}`,
    getFetchOpts(cfg, "search", {
      headers: { "Accept": "application/json" },
      retries: 2
    })
  );
  if (!r?.ok || !r.series?.title) return null;
  const s = r.series;
  const latestChapter = s.latest_chapters?.[0]?.number;
  const description = s.description
    ? cheerio.load(s.description).text().replace(/\s+/g, " ").trim() || undefined
    : undefined;
  return {
    id:               s.slug ?? String(s.id),
    title:            s.title,
    cover:            proxyCover(fixUrl(s.cover ?? "", cfg.baseUrl, cfg), cfg),
    description,
    latestChapter,
    sourceId:         cfg.id,
    genres:           s.genre?.length ? s.genre : undefined,
    type:             s.type?.[0],
    seriesUpdatedAt:  s.latest_chapters?.[0]?.modified_gmt ?? s.modified_gmt,
    alternativeTitle: s.alternative_title || undefined,
  };
}

async function rkTitleInfo(cfg: SourceConfig, titleId: string): Promise<SearchResult | null> {
  return rkSeriesDetail(cfg, titleId);
}

export async function wpSearch(cfg: SourceConfig, query: string): Promise<SearchResult[]> {
  const runRk = shouldRunReaderKiru(cfg);
  if (runRk) {
    try {
      const r = await rkSearch(cfg, query);
      if (r.length > 0) return r;
      if (cfg.wpReaderKiru === true) return [];
    } catch (err) {
      if (cfg.wpReaderKiru === true) throw err;
    }
  }
  if (cfg.wpReaderKiru === true) return [];
  if (cfg.wpTheme === "comicsera") return [];

  const apiPath = wpApiPath(cfg);
  const searchParam = cfg.searchParam || "search";
  const list = await fetchJson<WpPost[]>(
    `${cfg.baseUrl}${apiPath}/${mangaEndpoint(cfg)}`,
    getFetchOpts(cfg, "search", {
      params: { [searchParam]: query, per_page: cfg.searchLimit ?? 40, _fields: "slug,title,link,yoast_head" },
      retries: 2
    })
  );
  if (!Array.isArray(list) || list.length === 0) return [];

  const results: SearchResult[] = list.map(m => {
    const coverUrl = (cfg.wpYoastCover !== false) ? extractYoastCover(m.yoast_head) : "";
    return {
      id: m.link.replace(/\/$/, "").split("/").at(-1) ?? m.slug,
      title: m.title?.rendered ?? m.slug,
      cover: coverUrl ? proxyCover(fixUrl(coverUrl, cfg.baseUrl, cfg), cfg) : "",
      sourceId: cfg.id
    };
  }).filter(r => r.id && r.title);

  const batchSize = cfg.wpCoverBatchSize ?? 5;
  const updated = await batchAllSettled(results, async r => {
    if (r.cover) return r;
    try {
      const html = await fetchText(`${cfg.baseUrl}/${mangaEndpoint(cfg)}/${r.id}/`, getFetchOpts(cfg, "search", { retries: 1 }));
      const $ = cheerio.load(html);
      const cover =
        ((cfg.wpYoastCover !== false) ? $("meta[property='og:image']").attr("content") : "") ||
        $(".komik_info-cover img,.thumb img,.cover img").first().attr("src") ||
        $(".komik_info-cover img,.thumb img,.cover img").first().attr("data-src") || "";
      const chNums: number[] = [];
      $("#Daftar_Chapter tr,#chapter_list li,.cl li,#chapterlist li,.eph-num").each((_, el) => {
        const text = $(el).find("a").first().text().trim() || $(el).text().trim();
        const m = text.match(/(?:chapter|ch|bab|episode|ep)[.\s#-]*(\d+(?:\.\d+)?)/i)
               ?? text.match(/(\d+(?:\.\d+)?)\s*$/);
        if (m) { const n = Number(m[1]); if (!Number.isNaN(n)) chNums.push(n); }
      });
      const latestChapter = chNums.length > 0 ? Math.max(...chNums) : undefined;
      return { ...r, cover: cover ? proxyCover(fixUrl(processImageUrl(cover, cfg), cfg.baseUrl, cfg), cfg) : "", latestChapter };
    } catch { return r; }
  }, batchSize);

  return updated;
}

export async function wpChapters(cfg: SourceConfig, titleId: string): Promise<Chapter[]> {
  const runRk = shouldRunReaderKiru(cfg);
  if (runRk) {
    try {
      const r = await rkChapters(cfg, titleId);
      if (r.length > 0) return r;
      if (cfg.wpReaderKiru === true) return [];
    } catch (err) {
      if (cfg.wpReaderKiru === true) throw err;
    }
  }
  if (cfg.wpReaderKiru === true) return [];

  const chapters: Chapter[] = [];

  try {
    const html = await fetchText(`${cfg.baseUrl}/${mangaEndpoint(cfg)}/${titleId}/`, getFetchOpts(cfg, "chapters", { retries: 1 }));
    const $ = cheerio.load(html);

    $("#Daftar_Chapter tr,#chapter_list li,.cl li,#chapterlist li,.eph-num," +
      ".komik_info-chapters-wrapper li,.chapterlist li").each((_, el) => {
      const a = $(el).find("a").first();
      const href = a.attr("href") ?? "";
      if (!href) return;
      const id = slug(href);
      const text = a.text().trim() || $(el).text().trim();
      const numMatch =
        text.match(/(?:chapter|ch|bab|episode|ep)[.\s#-]*(\d+(?:\.\d+)?)/i) ??
        text.match(/(\d+(?:\.\d+)?)\s*$/);
      const num = numMatch ? Number(numMatch[1]) : NaN;
      if (!id || Number.isNaN(num) || chapters.find(c => c.id === id)) return;
      const rawDate =
        $(el).find(".tanggalseries,.chapter-date,.chapterdate").first().text().trim() ||
        $(el).find("[data-date]").attr("data-date") ||
        $(el).find("time").attr("datetime") ||
        (ID_DATE_RE.exec(text) ?? [])[0] || "";
      const chapterUpdatedAt = parseChapterDate(rawDate);
      const cleanTitle = text.replace(ID_DATE_RE, "").replace(/\s{2,}/g, " ").trim();
      chapters.push({ id, title: cleanTitle || `Chapter ${num}`, number: num, sourceId: cfg.id, titleId, chapterUpdatedAt });
    });
  } catch { /* html unavailable */ }

  if (chapters.length > 0) return chapters.sort((a, b) => a.number - b.number);

  if (cfg.wpTheme !== "comicsera") {
    try {
      const apiPath2 = wpApiPath(cfg);
      const postData = await fetchJson<WpPost[]>(
        `${cfg.baseUrl}${apiPath2}/${mangaEndpoint(cfg)}`,
        getFetchOpts(cfg, "chapters", {
          params: { slug: titleId, per_page: 1, _fields: "title" },
          retries: 1
        })
      );
      const postTitle = postData?.[0]?.title?.rendered?.replace(/&#\d+;/g, "'").trim() ?? "";
      if (!postTitle) throw new Error("no title");

      const perPage = cfg.wpChaptersPerPage ?? 300;
      const chapList = await fetchJson<WpPost[]>(
        `${cfg.baseUrl}${apiPath2}/${chapterEndpoint(cfg)}`,
        getFetchOpts(cfg, "chapters", {
          params: { search: postTitle, per_page: perPage, orderby: "id", order: "asc", _fields: "id,title" },
          retries: 2
        })
      );
      if (Array.isArray(chapList) && chapList.length > 0) {
        const postTitleLower = postTitle.toLowerCase();
        const wpChaps = chapList.map(c => {
          const text = (c.title?.rendered ?? "").replace(/&#\d+;/g, "'").replace(/&amp;/g, "&").trim();
          if (!text.toLowerCase().includes(postTitleLower)) return null;
          const m = text.match(/(?:chapter|ch|ep)[.\s#-]*(\d+(?:\.\d+)?)/i) ?? text.match(/(\d+(?:\.\d+)?)\s*$/);
          const num = m ? Number(m[1]) : NaN;
          if (!c.id || Number.isNaN(num)) return null;
          return { id: String(c.id), title: text || `Chapter ${num}`, number: num, sourceId: cfg.id, titleId };
        }).filter(Boolean) as Chapter[];
        if (wpChaps.length > 0) return wpChaps;
      }
    } catch { /* no chapter post type */ }
  }

  return chapters.sort((a, b) => a.number - b.number);
}

export async function wpPages(cfg: SourceConfig, chapterId: string): Promise<Page[]> {
  const runRk = /^\d+$/.test(chapterId) && shouldRunReaderKiru(cfg);
  if (runRk) {
    try {
      const r = await rkPages(cfg, chapterId);
      if (r.length > 0) return r;
      if (cfg.wpReaderKiru === true) return [];
    } catch (err) {
      if (cfg.wpReaderKiru === true) throw err;
    }
  }
  if (cfg.wpReaderKiru === true) return [];

  if (/^\d+$/.test(chapterId) && cfg.wpTheme !== "comicsera") {
    try {
      const apiPath = wpApiPath(cfg);
      type WpChapter = { content: { rendered: string } };
      const post = await fetchJson<WpChapter>(
        `${cfg.baseUrl}${apiPath}/${chapterEndpoint(cfg)}/${chapterId}`,
        getFetchOpts(cfg, "pages", { retries: 2 })
      );
      if (post?.content?.rendered) {
        const $ = cheerio.load(post.content.rendered);
        const images: string[] = [];
        $("img").each((_, el) => {
          const src = $(el).attr("src") ?? $(el).attr("data-src") ?? "";
          if (src && !src.includes("data:image")) images.push(fixUrl(processImageUrl(src, cfg), cfg.baseUrl, cfg));
        });
        if (images.length > 0) return images.map((imageUrl, i) => ({ chapterId, imageUrl: proxyPageImage(imageUrl, cfg), index: i }));
      }
    } catch { /* no wp chapter content */ }
  }

  const url = `${cfg.baseUrl}/${chapterId}/`;
  const html = await fetchText(url, getFetchOpts(cfg, "pages", { retries: 2 }));

  const tsPages = extractTsReaderImages(html, chapterId);
  if (tsPages) return tsPages.map(p => ({ ...p, imageUrl: proxyPageImage(processImageUrl(p.imageUrl, cfg), cfg) }));

  const $ = cheerio.load(html);
  const images: string[] = [];

  $([
    "#Baca_Komik img",".main-reading-area img",
    ".reading-content img","#readerarea img",
    ".chapter_ #chapter_body img"
  ].join(",")).each((_, el) => {
    const src =
      $(el).attr("src") ?? $(el).attr("data-src") ?? $(el).attr("data-lazy-src") ?? "";
    if (src && !src.includes("data:image") && src.match(/\.(jpg|jpeg|png|webp|gif)/i)) {
      images.push(fixUrl(processImageUrl(src, cfg), cfg.baseUrl, cfg));
    }
  });

  return images.map((imageUrl, i) => ({ chapterId, imageUrl: proxyPageImage(imageUrl, cfg), index: i }));
}

function parseClassList(classList: string[] = []): Pick<SearchResult, "genres" | "type"> {
  const genres: string[] = [];
  let type: string | undefined;
  for (const cls of classList) {
    if      (cls.startsWith("tipe-")) type = cls.slice(5);
    else if (cls.startsWith("genre-") && !cls.startsWith("genreutama-")) {
      genres.push(cls.slice(6).replace(/-/g, " "));
    }
  }
  return { genres: genres.length ? genres : undefined, type };
}

export async function wpTitleInfo(cfg: SourceConfig, titleId: string): Promise<SearchResult | null> {
  const runRk = shouldRunReaderKiru(cfg);
  if (runRk) {
    try {
      const r = await rkTitleInfo(cfg, titleId);
      if (r) return r;
      if (cfg.wpReaderKiru === true) return null;
    } catch (err) {
      if (cfg.wpReaderKiru === true) throw err;
    }
  }
  if (cfg.wpReaderKiru === true) return null;

  let html: SearchResult | null = null;
  try { html = await htmlTitleInfo(cfg, titleId); } catch { /* html unavailable */ }

  if (cfg.wpTheme === "comicsera") {
    return html;
  }

  const apiPath = wpApiPath(cfg);
  const list = await fetchJson<WpPost[]>(
    `${cfg.baseUrl}${apiPath}/${mangaEndpoint(cfg)}`,
    getFetchOpts(cfg, "search", {
      params: { slug: titleId, per_page: 1, _fields: "slug,title,link,excerpt,yoast_head,class_list,modified_gmt" },
      retries: 2
    })
  );

  if (!Array.isArray(list) || list.length === 0) {
    return html;
  }
  const post = list[0];
  const wpTitle = post.title?.rendered?.trim() ?? "";
  if (!wpTitle) return html;

  const coverUrl = (cfg.wpYoastCover !== false) ? extractYoastCover(post.yoast_head) : "";
  const wpCover = coverUrl ? proxyCover(fixUrl(coverUrl, cfg.baseUrl, cfg), cfg) : "";
  const rawExcerpt = post.excerpt?.rendered ?? "";
  const wpDesc = rawExcerpt ? cheerio.load(rawExcerpt).text().trim() : undefined;
  const { genres: wpGenres, type: wpType } = parseClassList(post.class_list);

  return {
    ...(html ?? { id: titleId, cover: "", sourceId: cfg.id }),
    title:            wpTitle,
    cover:            html?.cover || wpCover || "",
    description:      html?.description || wpDesc || undefined,
    genres:           html?.genres?.length ? html.genres : wpGenres,
    type:             html?.type  || wpType,
    seriesUpdatedAt:  html?.seriesUpdatedAt || post.modified_gmt || undefined,
    alternativeTitle: html?.alternativeTitle,
  };
}
