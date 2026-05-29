import { fetchJson, fetchText } from "../../services/fetchService.js";
import type { Chapter, Page, SearchResult, SourceConfig } from "../../../shared/types.js";
import { makeHeaders, getTimeout, getFetchOpts, extractDesc, proxyPageImage, processImageUrl } from "./shared.js";

function apiBase(cfg: SourceConfig): string {
  return (cfg.apiBase || cfg.baseUrl).replace(/\/$/, "");
}

function dedupTitle(title: string): string {
  const half = title.length >> 1;
  if (half > 0 && title.length % 2 === 0 && title.slice(0, half) === title.slice(half)) {
    return title.slice(0, half);
  }
  return title;
}

/** Pick the first non-null value from an object using a list of candidate keys */
function pick(item: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) {
    if (key in item && item[key] != null && item[key] !== "") return item[key];
  }
  return undefined;
}

type Envelope = SourceConfig["apiEnvelope"];

function matchEnvelope(res: Record<string, unknown>, want: Envelope): boolean {
  if (!want || want === "auto") return true;
  if (want === "retcode") return "retcode" in res;
  if (want === "success") return "success" in res && res.success === true;
  if (want === "wrapped") return "data" in res && !Array.isArray(res) && !("retcode" in res) && !("success" in res);
  if (want === "bare")    return Array.isArray(res);
  if (want === "laravel") return "data" in res && "meta" in res;
  return true;
}

export async function apiSearch(cfg: SourceConfig, query: string): Promise<SearchResult[]> {
  const base = apiBase(cfg);
  const enc = encodeURIComponent(query);
  const limit = cfg.searchLimit ?? 40;
  const p = cfg.searchParam;

  const attempts: Array<() => Promise<unknown>> = [];

  if (cfg.apiSearchEndpoints && cfg.apiSearchEndpoints.length > 0) {
    for (const template of cfg.apiSearchEndpoints) {
      const url = `${base}${template}`
        .replace("{base}", base)
        .replace("{q}", enc)
        .replace("{searchParam}", p ?? "q")
        .replace("{limit}", String(limit));
      attempts.push(() => fetchJson(url, getFetchOpts(cfg, "search", { retries: 1 })));
    }
  } else {
    if (p) {
      attempts.push(
        () => fetchJson(`${base}/search?${p}=${enc}`, getFetchOpts(cfg, "search", { retries: 1 })),
        () => fetchJson(`${base}/search?${p}=${enc}&limit=${limit}`, getFetchOpts(cfg, "search", { retries: 1 })),
        () => fetchJson(`${base}/manga?${p}=${enc}`, getFetchOpts(cfg, "search", { retries: 1 })),
        () => fetchJson(`${base}/series?${p}=${enc}`, getFetchOpts(cfg, "search", { retries: 1 })),
        () => fetchJson(`${base}/api/search?${p}=${enc}`, getFetchOpts(cfg, "search", { retries: 1 })),
      );
    }
    attempts.push(
      () => fetchJson(`${base}/manga/list?page=1&page_size=50&q=${enc}`, getFetchOpts(cfg, "search", { retries: 1 })),
      () => fetchJson(`${base}/v1/manga/list?page=1&page_size=50&q=${enc}`, getFetchOpts(cfg, "search", { retries: 1 })),
      () => fetchJson(`${base}/series?title=${enc}&take=${limit}`, getFetchOpts(cfg, "search", { retries: 1 })),
      () => fetchJson(`${base}/search?q=${enc}&limit=${limit}`, getFetchOpts(cfg, "search", { retries: 1 })),
      () => fetchJson(`${base}/api/v1.0/search?q=${enc}&limit=${limit}`, getFetchOpts(cfg, "search", { retries: 1 })),
      () => fetchJson(`${base}/manga-list?q=${enc}&limit=${limit}`, getFetchOpts(cfg, "search", { retries: 1 })),
    );
  }

  const env = cfg.apiEnvelope;
  const fm  = cfg.apiFieldMap;
  const idKeys    = fm?.id      ?? ["manga_id", "id", "slug", "hid"];
  const titleKeys = fm?.title   ?? ["title"];
  const coverKeys = fm?.cover   ?? ["cover_image_url", "cover_portrait_url", "coverImage", "cover_url", "cover", "img"];
  const chapKeys  = fm?.chapter ?? ["latest_chapter_number", "totalChapters", "total_chapters", "chapter_count", "last_chapter", "chapter"];
  const typeKeys  = fm?.type    ?? ["type", "format"];
  const genreKeys = fm?.genres  ?? ["genres", "genre"];

  for (const attempt of attempts) {
    try {
      const res = await attempt() as Record<string, unknown>;
      if (!res || typeof res !== "object") continue;

      // retcode envelope: { retcode: 0, data: [...] }
      if ((env === "retcode" || matchEnvelope(res, env)) && "retcode" in res) {
        const r = res as { retcode: number; data?: Record<string, unknown>[] };
        if (r.retcode !== 0 || !Array.isArray(r.data)) { if (env === "retcode") continue; }
        else {
          const items = r.data as Record<string, unknown>[];
          const out = items.map(item => {
            const nested = (item.data && typeof item.data === "object" && !Array.isArray(item.data))
              ? item.data as Record<string, unknown>
              : null;
            const rawCh = pick(item, chapKeys);
            const latestChapter = rawCh != null && !Number.isNaN(Number(rawCh)) ? Number(rawCh) : undefined;
            const alternativeTitle = (item.alternative_title as string | undefined)
              || (nested?.nativeTitle as string | undefined)
              || undefined;
            const tax = item.taxonomy as Record<string, { name: string }[]> | undefined;
            const genres = Array.isArray(tax?.Genre) ? tax!.Genre.map(g => g.name)
              : Array.isArray(pick(item, genreKeys)) ? (pick(item, genreKeys) as { name?: string }[]).map(g => g.name).filter((n): n is string => !!n)
              : undefined;
            const typeRaw = Array.isArray(tax?.Format) && tax!.Format.length > 0 ? tax!.Format[0].name : pick(item, typeKeys);
            const type = typeof typeRaw === "string" ? typeRaw || undefined : undefined;
            const seriesUpdatedAt = (item.updated_at as string | undefined) || undefined;
            return {
              id:          (pick(item, idKeys) ?? "") as string,
              title:       (pick(item, titleKeys) ?? "") as string,
              cover:       (pick(item, coverKeys) ?? "") as string,
              description: extractDesc(item, null),
              latestChapter, alternativeTitle, genres, type, seriesUpdatedAt,
              sourceId: cfg.id
            };
          }).filter(r => r.id && r.title);
          if (out.length > 0) return out;
          continue;
        }
      }

      // Generic array or { data: [], comics: [], results: [] }
      const list: Record<string, unknown>[] = Array.isArray(res)
        ? res as Record<string, unknown>[]
        : ((res.data ?? res.comics ?? res.results ?? []) as Record<string, unknown>[]);

      if (list.length > 0) {
        const out = list.map(item => {
          const nested = (item.data && typeof item.data === "object" && !Array.isArray(item.data))
            ? item.data as Record<string, unknown>
            : null;
          const urlId = (() => {
            const u = item.url;
            if (typeof u !== "string" || !u.includes("?")) return "";
            try { return new URL(u).searchParams.get("id") ?? ""; } catch { return ""; }
          })();
          const id    = (urlId || (nested?.slug ?? nested?.hid ?? (pick(item, idKeys) ?? ""))) as string;
          const rawTitle = (nested?.title ?? nested?.nativeTitle ?? (pick(item, titleKeys) ?? "")) as string;
          const title = dedupTitle(rawTitle);
          const cover = (nested?.coverImage ?? nested?.cover_image_url ?? nested?.cover ?? (pick(item, coverKeys) ?? "")) as string;
          const rawCh = nested?.totalChapters ?? nested?.latestChapter ?? pick(item, chapKeys);
          const latestChapter = rawCh != null && !Number.isNaN(Number(rawCh)) ? Number(rawCh) : undefined;
          const type = ((nested?.type ?? pick(item, typeKeys)) as string | undefined) || undefined;
          const seriesUpdatedAt = ((nested?.lastUpdated ?? item.lastUpdated ?? nested?.updatedAt ?? item.updatedAt) as string | undefined) || undefined;
          const rawGenres = pick(item, genreKeys);
          const genres = Array.isArray(rawGenres)
            ? (rawGenres as { name?: string }[]).map(g => typeof g === "string" ? g : g.name).filter((n): n is string => !!n)
            : undefined;
          return { id, title, cover, description: extractDesc(item, nested), latestChapter, type, genres, seriesUpdatedAt, sourceId: cfg.id };
        }).filter(r => r.id && r.title);
        if (out.length > 0) return out;
      }
    } catch { /* next */ }
  }
  return [];
}

export async function apiChapters(cfg: SourceConfig, titleId: string): Promise<Chapter[]> {
  const base = apiBase(cfg);
  const env = cfg.apiEnvelope;
  const cfm = cfg.apiChapterFieldMap;
  const idKeys  = cfm?.id     ?? ["chapter_id", "hid", "id", "slug"];
  const numKeys = cfm?.number ?? ["chapter_number", "number", "chap", "chapter", "chapterIndex", "index"];
  const ttlKeys = cfm?.title  ?? ["chapter_title", "title"];
  const dtKeys  = cfm?.date   ?? ["release_date", "updated_at", "updatedAt", "created_at", "createdAt", "date_gmt"];

  const templates: string[] = [];
  if (cfg.apiChapterEndpoints && cfg.apiChapterEndpoints.length > 0) {
    templates.push(...cfg.apiChapterEndpoints);
  } else {
    templates.push(
      "/chapter/{titleId}/list?page={page}&page_size={limit}&sort_by=chapter_number&sort_order=asc",
      "/v1/chapter/{titleId}/list?page={page}&page_size={limit}&sort_by=chapter_number&sort_order=asc",
      "/manga/{titleId}",
      "/series/{titleId}/chapters",
      "/api/v1.0/comic/{titleId}/chapters?limit={limit}",
      "/comic/{titleId}/chapters?limit={limit}"
    );
  }

  const pagination = cfg.apiPagination ?? "page";
  const limit = cfg.chapterBatchSize ?? 100;
  const totalPagesField = cfg.apiTotalPagesField ?? "total_pages";
  const cursorField = cfg.apiCursorField ?? "next_cursor";

  for (const template of templates) {
    try {
      const chapters: Chapter[] = [];
      let page = 1;
      let offset = 0;
      let cursor: string | null = null;
      let hasMore = true;

      while (hasMore) {
        const urlPath: string = template
          .replace("{titleId}", titleId)
          .replace("{page}", String(page))
          .replace("{offset}", String(offset))
          .replace("{cursor}", cursor ?? "")
          .replace("{limit}", String(limit));

        const url: string = `${base}${urlPath}`;
        const params: Record<string, unknown> = {};
        if (pagination === "page") {
          if (!template.includes("{page}")) params.page = page;
          if (!template.includes("{limit}")) params.page_size = limit;
        } else if (pagination === "offset") {
          if (!template.includes("{offset}")) params.offset = offset;
          if (!template.includes("{limit}")) params.limit = limit;
        } else if (pagination === "cursor") {
          if (cursor && !template.includes("{cursor}")) params.cursor = cursor;
          if (!template.includes("{limit}")) params.limit = limit;
        }

        const res = await fetchJson<any>(
          url,
          getFetchOpts(cfg, "chapters", { params, retries: 1 })
        );

        if (!res || typeof res !== "object") {
          break;
        }

        let list: Record<string, unknown>[] = [];
        let totalPages = 1;
        let nextCursor: string | null = null;

        if ((env === "retcode" || matchEnvelope(res, env)) && "retcode" in res) {
          const r = res as { retcode: number; data?: Record<string, unknown>[] | Record<string, unknown>; total_pages?: number };
          if (r.retcode === 0 && r.data) {
            list = Array.isArray(r.data) ? r.data : (Array.isArray((r.data as any).items) ? (r.data as any).items : []);
            totalPages = r.total_pages ?? (r as any).meta?.total_page ?? (r as any).meta?.total_pages ?? 1;
          }
        } else if ((env === "success" || matchEnvelope(res, env)) && "success" in res && res.success === true) {
          const info = ((res.data as Record<string, unknown>)?.info) as Record<string, unknown> | undefined;
          if (info && Array.isArray(info.chapters)) {
            list = info.chapters as Record<string, unknown>[];
          }
        } else {
          if (Array.isArray(res)) {
            const first = (res as Record<string, unknown>[])[0];
            if (first && Array.isArray(first.data) && (first.data as unknown[]).length > 0) {
              list = first.data as Record<string, unknown>[];
            } else {
              list = res as Record<string, unknown>[];
            }
          } else {
            const root = res.data ?? res;
            if (Array.isArray(root)) {
              list = root;
            } else if (root && typeof root === "object") {
              const obj = root as Record<string, unknown>;
              for (const k of ["chapters", "list", "comics", "results", "items", "data"]) {
                if (Array.isArray(obj[k])) {
                  list = obj[k] as Record<string, unknown>[];
                  break;
                }
              }
            }
          }
        }

        if (list.length === 0) {
          break;
        }

        const pageChaps = list.map(c => {
          const nested = (c.data && typeof c.data === "object" && !Array.isArray(c.data))
            ? c.data as Record<string, unknown>
            : null;
          let num = Number(nested?.index ?? pick(c, numKeys));
          const cidxRaw = nested?.index ?? c.chapterIndex;
          const compositeId = nested != null && cidxRaw != null ? `${titleId}/${cidxRaw}` : null;
          const chUrlId = (() => {
            const u = c.url;
            if (typeof u !== "string" || !u.includes("?")) return "";
            try { return new URL(u).searchParams.get("id") ?? ""; } catch { return ""; }
          })();
          const rawId = (chUrlId || (compositeId ?? (pick(c, idKeys) ?? ""))) as string;
          const id = (cfg.chapterIdWithTitle && rawId && !rawId.includes("/")) ? `${titleId}/${rawId}` : rawId;
          if (Number.isNaN(num)) {
            const raw = (nested?.title ?? pick(c, ttlKeys) ?? "") as string;
            const m = raw.match(/(?:chapter|ch|bab|episode|ep)[.\s#-]*(\d+(?:\.\d+)?)/i) ?? raw.match(/(\d+(?:\.\d+)?)\s*$/);
            if (m) num = Number(m[1]);
          }
          if (!id || Number.isNaN(num)) return null;
          const title = (nested?.title ?? (pick(c, ttlKeys) ?? "")) as string;
          const chapterUpdatedAt = ((pick(c, dtKeys) ?? nested?.updatedAt) as string | undefined) || undefined;
          return { id, title: title || `Chapter ${num}`, number: num, chapterUpdatedAt, sourceId: cfg.id, titleId };
        }).filter(Boolean) as Chapter[];

        chapters.push(...pageChaps);

        if (pagination === "none") {
          hasMore = false;
        } else if (pagination === "page") {
          const tpVal = res[totalPagesField] ?? (res.data as any)?.[totalPagesField];
          if (tpVal) totalPages = Number(tpVal);
          if (page >= totalPages || pageChaps.length === 0) {
            hasMore = false;
          } else {
            page++;
          }
        } else if (pagination === "offset") {
          if (pageChaps.length < limit) {
            hasMore = false;
          } else {
            offset += limit;
          }
        } else if (pagination === "cursor") {
          const curVal: any = res[cursorField] ?? (res.data as any)?.[cursorField];
          nextCursor = curVal ? String(curVal) : null;
          if (!nextCursor || pageChaps.length === 0) {
            hasMore = false;
          } else {
            cursor = nextCursor;
          }
        }
      }

      if (chapters.length > 0) {
        let result: Chapter[];
        if (cfg.chapterDeduplicate !== false) {
          const seen = new Set<number>();
          const deduped: Chapter[] = [];
          for (const c of chapters.sort((a, b) => a.number - b.number)) {
            if (!seen.has(c.number)) { seen.add(c.number); deduped.push(c); }
          }
          result = deduped;
        } else {
          result = chapters.sort((a, b) => a.number - b.number);
        }

        if (cfg.wpFetchDates && result.some(c => !c.chapterUpdatedAt)) {
          try {
            const ids = result.map(c => c.id).filter(id => /^\d+$/.test(id));
            if (ids.length > 0) {
              const dateMap = new Map<string, string>();
              const batchSize = 100;
              for (let i = 0; i < ids.length; i += batchSize) {
                const batch = ids.slice(i, i + batchSize).join(",");
                type WpPost = { id: number; date?: string };
                const posts = await fetchJson<WpPost[]>(
                  `${cfg.baseUrl}/wp-json/wp/v2/posts?include=${batch}&_fields=id,date&per_page=${batchSize}`,
                  getFetchOpts(cfg, "chapters", { retries: 1 })
                );
                if (Array.isArray(posts)) {
                  for (const p of posts) {
                    if (p.id && p.date) dateMap.set(String(p.id), p.date);
                  }
                }
              }
              if (dateMap.size > 0) {
                result = result.map(c => (!c.chapterUpdatedAt && dateMap.has(c.id))
                  ? { ...c, chapterUpdatedAt: dateMap.get(c.id) }
                  : c
                );
              }
            }
          } catch { /* date enrichment optional */ }
        }

        return result;
      }
    } catch { /* next */ }
  }
  return [];
}

export async function apiPages(cfg: SourceConfig, chapterId: string): Promise<Page[]> {
  const base = apiBase(cfg);
  const env = cfg.apiEnvelope;
  const imageKeys = cfg.apiPageFieldMap?.images ?? ["images", "image", "pages"];

  const sep = chapterId.lastIndexOf("/");
  const isComposite     = sep !== -1 && Number.isFinite(Number(chapterId.slice(sep + 1)));
  const isSlugComposite = sep !== -1 && !isComposite;
  const seriesSlug   = isComposite ? chapterId.slice(0, sep) : null;
  const chapterIndex = isComposite ? chapterId.slice(sep + 1) : null;

  const attempts: Array<() => Promise<unknown>> = [];

  if (cfg.apiPageEndpoints && cfg.apiPageEndpoints.length > 0) {
    for (const template of cfg.apiPageEndpoints) {
      const url = `${base}${template}`.replace("{base}", base).replace("{chapterId}", chapterId);
      attempts.push(() => fetchJson(url, getFetchOpts(cfg, "pages", { retries: 1 })));
    }
  } else {
    if (isComposite) {
      attempts.push(() => fetchJson(`${base}/series/${seriesSlug}/chapters/${chapterIndex}`, getFetchOpts(cfg, "pages", { retries: 1 })));
    }
    if (isSlugComposite) {
      const beforeSlash = chapterId.slice(0, sep);
      const afterSlash  = chapterId.slice(sep + 1);
      attempts.push(() => fetchJson(`${base}/read/${beforeSlash}/${afterSlash}`, getFetchOpts(cfg, "pages", { retries: 1 })));
    }
    attempts.push(
      () => fetchJson(`${base}/chapter/detail/${chapterId}`, getFetchOpts(cfg, "pages", { retries: 1 })),
      () => fetchJson(`${base}/v1/chapter/detail/${chapterId}`, getFetchOpts(cfg, "pages", { retries: 1 })),
      () => fetchJson(`${base}/chapter/${chapterId}`, getFetchOpts(cfg, "pages", { retries: 1 })),
      () => fetchJson(`${base}/api/v1.0/chapter/${chapterId}`, getFetchOpts(cfg, "pages", { retries: 1 })),
    );
  }

  for (const attempt of attempts) {
    try {
      const res = await attempt() as Record<string, unknown>;

      // retcode envelope: { retcode: 0, data: { base_url, chapter: { path, data: [] } } }
      if ((env === "retcode" || matchEnvelope(res, env)) && res && "retcode" in res) {
        const r = res as { retcode: number; data?: Record<string, unknown> };
        if (r.retcode !== 0 || !r.data) continue;
        const item = r.data as { base_url?: string; chapter?: { path?: string; data?: string[] } };
        const baseUrl = (item.base_url as string | undefined) || cfg.baseUrl;
        const path = item.chapter?.path || "";
        const files = item.chapter?.data;
        if (Array.isArray(files) && files.length > 0) {
          return files.map((f, i) => ({ chapterId, imageUrl: proxyPageImage(processImageUrl(`${baseUrl}${path}${f}`, cfg), cfg), index: i }));
        }
        continue;
      }

      // Generic image arrays at various response paths
      const raw = res as Record<string, unknown>;
      const dataObj  = raw.data  as Record<string, unknown> | null | undefined;
      const dataData = dataObj?.data as Record<string, unknown> | null | undefined;

      let images: string[] = [];
      for (const key of imageKeys) {
        if (Array.isArray(raw[key])) { images = raw[key] as string[]; break; }
      }
      if (images.length === 0) {
        if      (Array.isArray(dataData?.images)) images = dataData.images as string[];
        else if (Array.isArray(dataObj?.images))  images = dataObj.images as string[];
        else {
          const chapterImages = (dataObj?.chapter as Record<string, unknown> | undefined)?.images
                             ?? (raw.chapter as Record<string, unknown> | undefined)?.images;
          if (Array.isArray(chapterImages)) {
            images = (chapterImages as { url?: string }[]).map(i => i.url ?? (i as unknown as string));
          }
        }
      }

      if (images.length > 0) {
        return images.map((url, i) => {
          const imageUrl = processImageUrl(url.startsWith("http") ? url : `https:${url}`, cfg);
          return { chapterId, imageUrl: proxyPageImage(imageUrl, cfg), index: i };
        });
      }
    } catch { /* next */ }
  }
  return [];
}

export async function apiTitleInfo(cfg: SourceConfig, titleId: string): Promise<SearchResult | null> {
  const base = apiBase(cfg);
  const env = cfg.apiEnvelope;

  const attempts: Array<() => Promise<unknown>> = [
    () => fetchJson(`${base}/series/${titleId}`,          getFetchOpts(cfg, "search", { retries: 1 })),
    () => fetchJson(`${base}/manga/detail/${titleId}`,    getFetchOpts(cfg, "search", { retries: 1 })),
    () => fetchJson(`${base}/manga/${titleId}`,           getFetchOpts(cfg, "search", { retries: 1 })),
    () => fetchJson(`${base}/v1/manga/detail/${titleId}`, getFetchOpts(cfg, "search", { retries: 1 })),
    () => fetchJson(`${base}/comic/${titleId}`,           getFetchOpts(cfg, "search", { retries: 1 })),
  ];

  for (const attempt of attempts) {
    try {
      const res = await attempt() as Record<string, unknown>;

      // retcode envelope
      if ((env === "retcode" || matchEnvelope(res, env)) && res && "retcode" in res) {
        const r = res as { retcode: number; data?: Record<string, unknown> };
        if (r.retcode !== 0 || !r.data) continue;
        const d = r.data;
        const id = (d.manga_id ?? d.id ?? d.slug ?? titleId) as string;
        const title = (d.title ?? titleId) as string;
        const cover = (d.cover_image_url ?? d.cover_portrait_url ?? d.coverImage ?? "") as string;
        const description = extractDesc(d, null);
        const latestChapter = d.latest_chapter_number != null ? Number(d.latest_chapter_number) : undefined;
        const alternativeTitle = (d.alternative_title as string | undefined) || undefined;
        const tax = d.taxonomy as Record<string, { name: string }[]> | undefined;
        const genres = Array.isArray(tax?.Genre) ? tax!.Genre.map(g => g.name) : undefined;
        const type = Array.isArray(tax?.Format) && tax!.Format.length > 0 ? tax!.Format[0].name : undefined;
        const seriesUpdatedAt = (d.updated_at as string | undefined) || undefined;
        if (title) return { id, title, cover, description, latestChapter, alternativeTitle, genres, type, seriesUpdatedAt, sourceId: cfg.id };
        continue;
      }

      // success envelope
      if ((env === "success" || matchEnvelope(res, env)) && res && "success" in res && res.success === true) {
        const info = ((res.data as Record<string, unknown>)?.info) as Record<string, unknown> | undefined;
        if (info) {
          const id    = (info.slug ?? titleId) as string;
          const rawTitle = (info.title ?? titleId) as string;
          const title = dedupTitle(rawTitle);
          const cover = (info.coverImage ?? info.cover_image_url ?? "") as string;
          const description = extractDesc(info, null);
          const type = (info.type as string | undefined) || undefined;
          const genres = Array.isArray(info.genres) ? (info.genres as string[]) : undefined;
          const seriesUpdatedAt = (info.lastUpdated as string | undefined) || undefined;
          const chList = Array.isArray(info.chapters) ? info.chapters as Record<string, unknown>[] : [];
          const chNums = chList.map(c => {
            const text = (c.title ?? "") as string;
            const m = text.match(/(\d+(?:\.\d+)?)\s*$/);
            return m ? Number(m[1]) : NaN;
          }).filter(n => !isNaN(n));
          const latestChapter = chNums.length > 0 ? Math.max(...chNums) : undefined;
          if (title && title !== titleId) {
            return { id, title, cover, description, latestChapter, type, genres, seriesUpdatedAt, sourceId: cfg.id };
          }
        }
      }

      if (Array.isArray(res)) {
        const detail = (res as unknown as Record<string, unknown>[])[0];
        if (detail) {
          const title = (detail.title ?? titleId) as string;
          const cover = (detail.cover ?? detail.img ?? "") as string;
          const description = extractDesc(detail, null);
          const type = (detail.type as string | undefined) || undefined;
          const genres = Array.isArray(detail.genre)
            ? (detail.genre as Record<string, unknown>[])
                .map(g => g.name as string | undefined)
                .filter((n): n is string => typeof n === "string" && n.length > 0)
            : undefined;
          const chNums = Array.isArray(detail.data)
            ? (detail.data as Record<string, unknown>[])
                .map(e => parseFloat(String(e.chapter ?? "")))
                .filter(n => !isNaN(n))
            : [];
          const latestChapter = chNums.length > 0 ? Math.max(...chNums) : undefined;

          let seriesUpdatedAt: string | undefined;
          let alternativeTitle: string | undefined;
          try {
            const wpPost = await fetchJson(
              `${cfg.baseUrl}/wp-json/wp/v2/manga/${titleId}`,
              getFetchOpts(cfg, "search", { retries: 1 })
            ) as Record<string, unknown>;
            if (wpPost?.modified_gmt) seriesUpdatedAt = wpPost.modified_gmt as string;
            if (typeof wpPost?.slug === "string") {
              const htmlPage = await fetchText(
                `${cfg.baseUrl}/komik/${wpPost.slug}/`,
                getFetchOpts(cfg, "search", { retries: 1 })
              );
              const altMatch = htmlPage.match(/[Aa]lternatif[^<]{0,20}<[^>]+>\s*([\s\S]*?)\s*<\//);
              if (altMatch?.[1]?.trim()) alternativeTitle = altMatch[1].trim();
            }
          } catch { /* supplementary data unavailable */ }

          if (title && title !== titleId) {
            return { id: titleId, title, cover, description, latestChapter, type, genres, seriesUpdatedAt, alternativeTitle, sourceId: cfg.id };
          }
        }
        continue;
      }

      const topData = res.data as Record<string, unknown> | undefined;
      const nested  = (topData?.data && typeof topData.data === "object")
        ? topData.data as Record<string, unknown>
        : topData;

      if (nested) {
        const id    = (nested.slug ?? nested.hid ?? nested.manga_id ?? nested.id ?? titleId) as string;
        const title = (nested.title ?? titleId) as string;
        const cover = (nested.coverImage ?? nested.cover_image_url ?? nested.cover ?? "") as string;
        const description = extractDesc(nested, null);
        const totalCh = nested.totalChapters != null ? parseInt(String(nested.totalChapters), 10) : NaN;
        const latestChapter = !Number.isNaN(totalCh) ? totalCh : undefined;
        const type = (nested.format as string | undefined) || undefined;
        const alternativeTitle = (nested.nativeTitle as string | undefined) || undefined;
        const genres = Array.isArray(nested.genres)
          ? (nested.genres as Record<string, unknown>[])
              .map(g => {
                const gData = g.data as Record<string, unknown> | undefined;
                return (gData?.name ?? g.name) as string | undefined;
              })
              .filter((n): n is string => typeof n === "string" && n.length > 0)
          : undefined;
        const seriesUpdatedAt = (topData?.updatedAt as string | undefined) || undefined;
        if (title && title !== titleId) {
          return { id: id as string, title, cover, description, latestChapter, type, alternativeTitle, genres, seriesUpdatedAt, sourceId: cfg.id };
        }
      }
    } catch { /* try next */ }
  }
  return null;
}
