import * as cheerio from "cheerio";
import { fetchText } from "../../services/fetchService.js";
import type { Chapter, Page, SearchResult, SourceConfig } from "../../../shared/types.js";
import { getFetchOpts, buildUrl, fixUrl, proxyCover, proxyPageImage, processImageUrl } from "./shared.js";

function getPath(obj: any, pathStr?: string): any {
  if (!pathStr || !obj) return obj;
  const parts = pathStr.split(".");
  let cur = obj;
  for (const p of parts) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = cur[p];
  }
  return cur;
}

function pick(item: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) {
    if (key in item && item[key] != null && item[key] !== "") return item[key];
  }
  return undefined;
}

function extractNext(html: string): any {
  const $ = cheerio.load(html);
  const script = $("script#__NEXT_DATA__").html();
  if (!script) return {};
  try {
    return JSON.parse(script);
  } catch {
    return {};
  }
}

function extractNuxt(html: string): any {
  const m = html.match(/window\.__NUXT__\s*=\s*([\s\S]+?)(?:<\/script>|;)/);
  if (!m) return {};
  try {
    let js = m[1].trim();
    if (js.endsWith(";")) js = js.slice(0, -1);
    return new Function(`return ${js}`)();
  } catch {
    return {};
  }
}

export async function nextjsSearch(cfg: SourceConfig, query: string): Promise<SearchResult[]> {
  const method = cfg.method;
  const isNuxt = method === "nuxtjs";
  const enc = encodeURIComponent(query);
  const searchUrl = cfg.searchEndpoints?.[0]
    ? cfg.searchEndpoints[0].replace("{base}", cfg.baseUrl).replace("{q}", enc)
    : `${cfg.baseUrl}/search?q=${enc}`;

  const html = await fetchText(searchUrl, getFetchOpts(cfg, "search", { retries: 1 }));
  const pageData = isNuxt ? extractNuxt(html) : extractNext(html);

  const path = isNuxt ? (cfg.nuxtDataPath ?? "data") : (cfg.nextDataPath ?? "props.pageProps.mangaList");
  const rawList = getPath(pageData, path);
  const list = Array.isArray(rawList) ? rawList : [];

  const fm = cfg.apiFieldMap;
  const idKeys    = fm?.id      ?? ["manga_id", "id", "slug", "hid"];
  const titleKeys = fm?.title   ?? ["title", "name"];
  const coverKeys = fm?.cover   ?? ["coverImage", "cover", "thumbnail"];

  return list.map((item: any) => {
    return {
      id: String(pick(item, idKeys) ?? ""),
      title: String(pick(item, titleKeys) ?? ""),
      cover: proxyCover(fixUrl(String(pick(item, coverKeys) ?? ""), cfg.baseUrl, cfg), cfg),
      sourceId: cfg.id
    };
  }).filter(r => r.id && r.title);
}

export async function nextjsChapters(cfg: SourceConfig, titleId: string): Promise<Chapter[]> {
  const method = cfg.method;
  const isNuxt = method === "nuxtjs";
  const url = buildUrl(cfg, cfg.seriesUrl, titleId);

  const html = await fetchText(url, getFetchOpts(cfg, "chapters", { retries: 2 }));
  const pageData = isNuxt ? extractNuxt(html) : extractNext(html);

  const path = isNuxt ? (cfg.nuxtChaptersPath ?? "chapters") : (cfg.nextChaptersPath ?? "props.pageProps.chapters");
  const rawList = getPath(pageData, path);
  const list = Array.isArray(rawList) ? rawList : [];

  const cfm = cfg.apiChapterFieldMap;
  const idKeys  = cfm?.id     ?? ["chapter_id", "id", "slug"];
  const numKeys = cfm?.number ?? ["chapter_number", "number", "index"];
  const ttlKeys = cfm?.title  ?? ["title", "name"];

  const chaps = list.map((c: any) => {
    const num = Number(pick(c, numKeys));
    const id = String(pick(c, idKeys) ?? "");
    if (!id || Number.isNaN(num)) return null;
    return {
      id,
      title: String(pick(c, ttlKeys) ?? `Chapter ${num}`),
      number: num,
      sourceId: cfg.id,
      titleId
    };
  }).filter(Boolean) as Chapter[];

  return chaps.sort((a, b) => a.number - b.number);
}

export async function nextjsPages(cfg: SourceConfig, chapterId: string): Promise<Page[]> {
  const method = cfg.method;
  const isNuxt = method === "nuxtjs";
  const url = buildUrl(cfg, cfg.chapterUrl, chapterId);

  const html = await fetchText(url, getFetchOpts(cfg, "pages", { retries: 2 }));
  const pageData = isNuxt ? extractNuxt(html) : extractNext(html);

  const path = isNuxt ? (cfg.nuxtPagesPath ?? "images") : (cfg.nextPagesPath ?? "props.pageProps.images");
  const rawList = getPath(pageData, path);
  const list = Array.isArray(rawList) ? rawList : [];

  return list.map((item: any, i: number) => {
    const url = typeof item === "string" ? item : (item.url ?? item.imageUrl ?? "");
    const imageUrl = processImageUrl(url.startsWith("http") ? url : `https:${url}`, cfg);
    return {
      chapterId,
      imageUrl: proxyPageImage(imageUrl, cfg),
      index: i
    };
  });
}

export async function nextjsTitleInfo(cfg: SourceConfig, titleId: string): Promise<SearchResult | null> {
  const method = cfg.method;
  const isNuxt = method === "nuxtjs";
  const url = buildUrl(cfg, cfg.seriesUrl, titleId);

  try {
    const html = await fetchText(url, getFetchOpts(cfg, "search", { retries: 1 }));
    const pageData = isNuxt ? extractNuxt(html) : extractNext(html);

    const path = isNuxt ? (cfg.nuxtDataPath ?? "manga") : (cfg.nextDataPath ?? "props.pageProps.manga");
    const data = getPath(pageData, path);
    if (!data) return null;

    const fm = cfg.apiFieldMap;
    const titleKeys = fm?.title ?? ["title", "name"];
    const coverKeys = fm?.cover ?? ["coverImage", "cover", "thumbnail"];

    return {
      id: titleId,
      title: String(pick(data, titleKeys) ?? titleId),
      cover: proxyCover(fixUrl(String(pick(data, coverKeys) ?? ""), cfg.baseUrl, cfg), cfg),
      sourceId: cfg.id,
    };
  } catch {
    return null;
  }
}
