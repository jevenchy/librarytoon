import { fetchJson } from "../../services/fetchService.js";
import type { Chapter, Page, SearchResult, SourceConfig } from "../../../shared/types.js";
import { getFetchOpts, fixUrl, proxyCover, proxyPageImage, processImageUrl } from "./shared.js";

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

export async function graphqlSearch(cfg: SourceConfig, query: string): Promise<SearchResult[]> {
  const endpoint = cfg.graphqlEndpoint ?? `${cfg.baseUrl.replace(/\/$/, "")}/graphql`;
  const gqlQuery = cfg.graphqlSearchQuery;
  if (!gqlQuery) return [];

  const varName = cfg.graphqlSearchVar ?? "query";
  const limit = cfg.searchLimit ?? 40;

  const res = await fetchJson<any>(
    endpoint,
    getFetchOpts(cfg, "search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      data: {
        query: gqlQuery,
        variables: {
          [varName]: query,
          limit
        }
      },
      retries: 1
    })
  );

  const rawList = getPath(res, cfg.graphqlSearchPath ?? "data.Page.media");
  const list = Array.isArray(rawList) ? rawList : [];

  const fm = cfg.apiFieldMap;
  const idKeys    = fm?.id      ?? ["manga_id", "id", "slug", "hid"];
  const titleKeys = fm?.title   ?? ["title"];
  const coverKeys = fm?.cover   ?? ["cover_image_url", "cover_portrait_url", "coverImage", "cover_url", "cover", "img"];
  const chapKeys  = fm?.chapter ?? ["latest_chapter_number", "totalChapters", "total_chapters", "chapter_count", "last_chapter", "chapter"];
  const typeKeys  = fm?.type    ?? ["type", "format"];
  const genreKeys = fm?.genres  ?? ["genres", "genre"];

  return list.map((item: any) => {
    let rawCover = pick(item, coverKeys);
    if (rawCover && typeof rawCover === "object") {
      rawCover = (rawCover as any).large ?? (rawCover as any).medium ?? (rawCover as any).extraLarge ?? "";
    }
    const rawCh = pick(item, chapKeys);
    const latestChapter = rawCh != null && !Number.isNaN(Number(rawCh)) ? Number(rawCh) : undefined;
    const typeRaw = pick(item, typeKeys);
    const type = typeof typeRaw === "string" ? typeRaw : undefined;
    const genres = Array.isArray(pick(item, genreKeys)) ? (pick(item, genreKeys) as any[]).map(g => typeof g === "object" ? g.name : g) : undefined;

    return {
      id: String(pick(item, idKeys) ?? ""),
      title: String(pick(item, titleKeys) ?? ""),
      cover: proxyCover(fixUrl(String(rawCover ?? ""), cfg.baseUrl, cfg), cfg),
      latestChapter,
      type,
      genres,
      sourceId: cfg.id
    };
  }).filter(r => r.id && r.title);
}

export async function graphqlChapters(cfg: SourceConfig, titleId: string): Promise<Chapter[]> {
  const endpoint = cfg.graphqlEndpoint ?? `${cfg.baseUrl.replace(/\/$/, "")}/graphql`;
  const gqlQuery = cfg.graphqlChaptersQuery;
  if (!gqlQuery) return [];

  const res = await fetchJson<any>(
    endpoint,
    getFetchOpts(cfg, "chapters", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      data: {
        query: gqlQuery,
        variables: {
          id: isNaN(Number(titleId)) ? titleId : Number(titleId),
          titleId
        }
      },
      retries: 1
    })
  );

  const rawList = getPath(res, cfg.graphqlChaptersPath ?? "data.manga.chapters");
  const list = Array.isArray(rawList) ? rawList : [];

  const cfm = cfg.apiChapterFieldMap;
  const idKeys  = cfm?.id     ?? ["chapter_id", "hid", "id", "slug"];
  const numKeys = cfm?.number ?? ["chapter_number", "number", "chap", "chapter", "chapterIndex", "index"];
  const ttlKeys = cfm?.title  ?? ["chapter_title", "title"];
  const dtKeys  = cfm?.date   ?? ["release_date", "updated_at", "updatedAt", "created_at", "createdAt", "date_gmt"];

  const chaps = list.map((c: any) => {
    const num = Number(pick(c, numKeys));
    const id = String(pick(c, idKeys) ?? "");
    if (!id || Number.isNaN(num)) return null;
    const chapterUpdatedAt = (pick(c, dtKeys) as string | undefined) || undefined;
    return {
      id,
      title: String(pick(c, ttlKeys) ?? `Chapter ${num}`),
      number: num,
      chapterUpdatedAt,
      sourceId: cfg.id,
      titleId
    };
  }).filter(Boolean) as Chapter[];

  return chaps.sort((a, b) => a.number - b.number);
}

export async function graphqlPages(cfg: SourceConfig, chapterId: string): Promise<Page[]> {
  const endpoint = cfg.graphqlEndpoint ?? `${cfg.baseUrl.replace(/\/$/, "")}/graphql`;
  const gqlQuery = cfg.graphqlPagesQuery;
  if (!gqlQuery) return [];

  const res = await fetchJson<any>(
    endpoint,
    getFetchOpts(cfg, "pages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      data: {
        query: gqlQuery,
        variables: {
          id: isNaN(Number(chapterId)) ? chapterId : Number(chapterId),
          chapterId
        }
      },
      retries: 1
    })
  );

  const rawList = getPath(res, cfg.graphqlPagesPath ?? "data.chapter.pages");
  const list = Array.isArray(rawList) ? rawList : [];

  return list.map((item: any, i: number) => {
    const url = typeof item === "string" ? item : (item.url ?? item.imageUrl ?? item.image ?? "");
    const imageUrl = processImageUrl(url.startsWith("http") ? url : `https:${url}`, cfg);
    return {
      chapterId,
      imageUrl: proxyPageImage(imageUrl, cfg),
      index: i
    };
  });
}

export async function graphqlTitleInfo(cfg: SourceConfig, titleId: string): Promise<SearchResult | null> {
  const endpoint = cfg.graphqlEndpoint ?? `${cfg.baseUrl.replace(/\/$/, "")}/graphql`;
  const gqlQuery = cfg.graphqlChaptersQuery;
  if (!gqlQuery) return null;

  try {
    const res = await fetchJson<any>(
      endpoint,
      getFetchOpts(cfg, "search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        data: {
          query: gqlQuery,
          variables: {
            id: isNaN(Number(titleId)) ? titleId : Number(titleId),
            titleId
          }
        },
        retries: 1
      })
    );

    const data = getPath(res, "data.manga") ?? getPath(res, "data.media") ?? res.data;
    if (!data) return null;

    const fm = cfg.apiFieldMap;
    const titleKeys = fm?.title ?? ["title"];
    const coverKeys = fm?.cover ?? ["coverImage", "cover"];
    let rawCover = pick(data, coverKeys);
    if (rawCover && typeof rawCover === "object") {
      rawCover = (rawCover as any).large ?? (rawCover as any).medium ?? "";
    }

    return {
      id: titleId,
      title: String(pick(data, titleKeys) ?? titleId),
      cover: proxyCover(fixUrl(String(rawCover ?? ""), cfg.baseUrl, cfg), cfg),
      sourceId: cfg.id,
    };
  } catch {
    return null;
  }
}
