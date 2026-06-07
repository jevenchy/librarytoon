import type { Chapter, SourceConfig } from "../../../shared/types.js";
import { fetchJson } from "../../services/fetchService.js";
import { getFetchOpts, derivePattern, getField, encodePathSegments } from "../shared.js";
import { buildChapterNumRe } from "../html/index.js";
import { apiBase, matchEnvelope } from "./index.js";

export async function apiChapters(cfg: SourceConfig, titleId: string, signal?: AbortSignal): Promise<Chapter[]> {
  const base = apiBase(cfg);
  const envelope = cfg.api?.envelope;
  const chapterFieldMap = cfg.api?.chapterFieldMap;
  const idKeys  = chapterFieldMap?.id     ?? ["chapter_id", "hid", "id", "slug"];
  const numKeys = chapterFieldMap?.number ?? ["chapter_number", "number", "chap", "chapter", "chapterIndex", "index"];
  const ttlKeys = chapterFieldMap?.title  ?? ["chapter_title", "title"];
  const dtKeys  = chapterFieldMap?.date   ?? ["release_date", "updated_at", "updatedAt", "created_at", "createdAt", "date_gmt"];
  const chapNumRe = buildChapterNumRe(cfg);

  const seriesDepth  = cfg.seriesUrl  ? derivePattern(cfg.baseUrl, cfg.seriesUrl).prefix.split("/").filter(Boolean).length  : 0;
  const chapterDepth = cfg.chapterUrl ? derivePattern(cfg.baseUrl, cfg.chapterUrl).prefix.split("/").filter(Boolean).length : 0;
  const isNestedCh   = chapterDepth > seriesDepth;
  const seriesPrefix = cfg.seriesUrl ? derivePattern(cfg.baseUrl, cfg.seriesUrl).prefix.replace(/^\//, "").replace(/\/$/, "") : "";

  const templates: string[] = [];
  if (cfg.api?.chapterEndpoints && cfg.api.chapterEndpoints.length > 0) {
    templates.push(...cfg.api.chapterEndpoints);
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

  const pagination = cfg.api?.pagination ?? "page";
  const limit = cfg.chapterBatchSize ?? 100;
  const totalPagesField = cfg.api?.totalPagesField ?? "total_pages";
  const cursorField = cfg.api?.cursorField ?? "next_cursor";

  const MAX_PAGES = 200;
  const CHAPTERS_DEADLINE_MS = 60_000;
  const outerDeadline = Date.now() + CHAPTERS_DEADLINE_MS * 2;

  let hasReceivedResponse = false;
  let lastFetchError: unknown;

  for (const template of templates) {
    if (Date.now() >= outerDeadline) break;
    if (signal?.aborted) break;
    try {
      const chapters: Chapter[] = [];
      let page = 1;
      let offset = 0;
      let cursor: string | null = null;
      let hasMore = true;
      let iterations = 0;
      const deadline = Date.now() + CHAPTERS_DEADLINE_MS;

      while (hasMore && iterations < MAX_PAGES && Date.now() < deadline) {
        if (signal?.aborted) break;
        iterations++;
        const urlPath: string = template
          .replace("{titleId}", encodePathSegments(titleId))
          .replace("{page}", String(page))
          .replace("{offset}", String(offset))
          .replace("{cursor}", cursor ?? "")
          .replace("{limit}", String(limit));

        const url: string = `${base}${urlPath}`;
        const params: Record<string, unknown> = {};
        if (pagination === "page") {
          if (!template.includes("{page}")) params.page = page;
          if (!template.includes("{limit}") && !template.includes("{page}")) params.page_size = limit;
        } else if (pagination === "offset") {
          if (!template.includes("{offset}")) params.offset = offset;
          if (!template.includes("{limit}")) params.limit = limit;
        } else if (pagination === "cursor") {
          if (cursor && !template.includes("{cursor}")) params.cursor = cursor;
          if (!template.includes("{limit}")) params.limit = limit;
        }

        const res = await fetchJson<unknown>(
          url,
          getFetchOpts(cfg, "chapters", { params, retries: 1 }, signal)
        );
        hasReceivedResponse = true;

        if (!res || typeof res !== "object") {
          break;
        }

        const resObj = res as Record<string, unknown>;
        let list: Record<string, unknown>[] = [];
        let totalPages = 1;
        let nextCursor: string | null = null;

        if ((envelope === "retcode" || matchEnvelope(resObj, envelope)) && "retcode" in resObj) {
          const retcodeEnv = resObj as { retcode: number; data?: Record<string, unknown>[] | Record<string, unknown>; total_pages?: number; meta?: Record<string, unknown> };
          if (retcodeEnv.retcode === 0 && retcodeEnv.data) {
            const dataObj = retcodeEnv.data as Record<string, unknown>;
            list = Array.isArray(retcodeEnv.data) ? (retcodeEnv.data as Record<string, unknown>[]) : (Array.isArray(dataObj?.items) ? (dataObj.items as Record<string, unknown>[]) : []);
            totalPages = retcodeEnv.total_pages ?? (retcodeEnv.meta?.total_page as number | undefined) ?? (retcodeEnv.meta?.total_pages as number | undefined) ?? 1;
          }
        } else if ((envelope === "success" || matchEnvelope(resObj, envelope)) && "success" in resObj && resObj.success === true) {
          const responseInfo = (resObj.data as Record<string, unknown> | undefined)?.info as Record<string, unknown> | undefined;
          if (responseInfo && Array.isArray(responseInfo.chapters)) {
            list = responseInfo.chapters as Record<string, unknown>[];
          }
        } else {
          if (Array.isArray(resObj)) {
            const first = (resObj as Record<string, unknown>[])[0];
            if (first && Array.isArray(first.data) && (first.data as unknown[]).length > 0) {
              list = first.data as Record<string, unknown>[];
            } else {
              list = resObj as Record<string, unknown>[];
            }
          } else {
            const root = resObj.data ?? resObj;
            if (Array.isArray(root)) {
              list = root as Record<string, unknown>[];
            } else if (root && typeof root === "object") {
              const rootRecord = root as Record<string, unknown>;
              for (const fieldKey of ["chapters", "list", "comics", "results", "items", "data"]) {
                if (Array.isArray(rootRecord[fieldKey])) {
                  list = rootRecord[fieldKey] as Record<string, unknown>[];
                  break;
                }
              }
              if (list.length === 0 && Array.isArray(rootRecord.Season)) {
                list = (rootRecord.Season as Array<Record<string, unknown>>)
                  .flatMap(season => Array.isArray(season.Chapter) ? season.Chapter as Record<string, unknown>[] : []);
              }
            }
          }
        }

        if (list.length === 0) {
          break;
        }

        const pageChaps = list.map(entry => {
          if (entry.requiresPurchase === true || (entry.price != null && Number(entry.price) > 0)) return null;

          const nested = (entry.data && typeof entry.data === "object" && !Array.isArray(entry.data))
            ? entry.data as Record<string, unknown>
            : null;
          let num = Number(nested?.index ?? getField(entry, numKeys));
          const cidxRaw = nested?.index ?? entry.chapterIndex;
          const compositeId = nested != null && cidxRaw != null ? `${titleId}/${cidxRaw}` : null;
          const chUrlId = (() => {
            const rawUrl = entry.url;
            if (typeof rawUrl !== "string" || !rawUrl.includes("?")) return "";
            try { return new URL(rawUrl).searchParams.get("id") ?? ""; } catch { return ""; }
          })();
          let rawId = (chUrlId || (compositeId ?? (getField(entry, idKeys) ?? ""))) as string;
          if (Number.isNaN(num)) {
            const raw = (nested?.title ?? getField(entry, ttlKeys) ?? "") as string;
            const numMatch = raw.match(chapNumRe) ?? raw.match(/(\d+(?:\.\d+)?)\s*$/);
            if (numMatch) num = Number(numMatch[1]);
          }
          if (cfg.api?.chapterIdTemplate && rawId && !Number.isNaN(num)) {
            rawId = cfg.api.chapterIdTemplate.replace("{number}", String(num)).replace("{id}", rawId);
          }
          const id = isNestedCh && rawId && !rawId.includes("/")
            ? `${seriesPrefix}/${titleId}/${rawId}`
            : (cfg.chapterIdWithTitle && rawId && !rawId.includes("/")) ? `${titleId}/${rawId}` : rawId;
          if (!id || Number.isNaN(num)) return null;
          const title = (nested?.title ?? (getField(entry, ttlKeys) ?? "")) as string;
          const chapterUpdatedAt = ((getField(entry, dtKeys) ?? nested?.updatedAt) as string | undefined) || undefined;
          return { id, title: title || `Chapter ${num}`, number: num, chapterUpdatedAt, sourceId: cfg.id, titleId };
        }).filter(Boolean) as Chapter[];

        chapters.push(...pageChaps);

        if (pagination === "none") {
          hasMore = false;
        } else if (pagination === "page") {
          const dataField = resObj.data as Record<string, unknown> | undefined;
          const tpVal = resObj[totalPagesField] ?? dataField?.[totalPagesField];
          if (tpVal) totalPages = Number(tpVal);
          if (page >= totalPages || list.length === 0) {
            hasMore = false;
          } else {
            page++;
          }
        } else if (pagination === "offset") {
          if (list.length < limit) {
            hasMore = false;
          } else {
            offset += limit;
          }
        } else if (pagination === "cursor") {
          const dataField2 = resObj.data as Record<string, unknown> | undefined;
          const curVal = resObj[cursorField] ?? dataField2?.[cursorField];
          nextCursor = curVal ? String(curVal) : null;
          if (!nextCursor || list.length === 0) {
            hasMore = false;
          } else {
            cursor = nextCursor;
          }
        }
      }

      if (chapters.length > 0) {
        let finalChapters: Chapter[];
        if (cfg.chapterDeduplicate !== false) {
          const seen = new Set<number>();
          const deduped: Chapter[] = [];
          for (const chapter of chapters.sort((chap1, chap2) => chap1.number - chap2.number)) {
            if (!seen.has(chapter.number)) { seen.add(chapter.number); deduped.push(chapter); }
          }
          finalChapters = deduped;
        } else {
          finalChapters = chapters.sort((chap1, chap2) => chap1.number - chap2.number);
        }

        if (cfg.wordpress?.fetchDates && finalChapters.some(chapter => !chapter.chapterUpdatedAt)) {
          try {
            const ids = finalChapters.map(chapter => chapter.id).filter(id => /^\d+$/.test(id));
            if (ids.length > 0) {
              const wpApi = (cfg.wordpress?.apiPath ?? "/wp-json/wp/v2").replace(/\/$/, "");
              const dateMap = new Map<string, string>();
              const batchSize = 100;
              for (let batchIdx = 0; batchIdx < ids.length; batchIdx += batchSize) {
                const batch = ids.slice(batchIdx, batchIdx + batchSize).join(",");
                const posts = await fetchJson<{ id: number; date?: string }[]>(
                  `${cfg.baseUrl}${wpApi}/posts?include=${batch}&_fields=id,date&per_page=${batchSize}`,
                  getFetchOpts(cfg, "chapters", { retries: 1 }, signal)
                );
                if (Array.isArray(posts)) {
                  for (const post of posts) {
                    if (post.id && post.date) dateMap.set(String(post.id), post.date);
                  }
                }
              }
              if (dateMap.size > 0) {
                finalChapters = finalChapters.map(chapter => (!chapter.chapterUpdatedAt && dateMap.has(chapter.id))
                  ? { ...chapter, chapterUpdatedAt: dateMap.get(chapter.id) }
                  : chapter
                );
              }
            }
          } catch {
            // WordPress date enrichment is optional. Returns chapters list without dates if this fails.
          }
        }

        return finalChapters;
      }
    } catch (err) {
      lastFetchError = err;
    }
  }

  if (!hasReceivedResponse && lastFetchError !== undefined) throw lastFetchError;

  return [];
}
