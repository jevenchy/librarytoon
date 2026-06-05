import type { SearchResult, SourceConfig } from "../../../shared/types.js";
import { fetchJson } from "../../services/fetchService.js";
import { getFetchOpts, extractDesc, getField } from "../shared.js";
import { apiBase, apiCover, dedupTitle, matchEnvelope } from "./index.js";

export async function apiSearch(cfg: SourceConfig, query: string, signal?: AbortSignal): Promise<SearchResult[]> {
  const base = apiBase(cfg);
  const enc = encodeURIComponent(query);
  const limit = cfg.search?.limit ?? 40;
  const searchParam = cfg.search?.param;

  const attempts: Array<() => Promise<unknown>> = [];

  if (cfg.api?.searchEndpoints && cfg.api.searchEndpoints.length > 0) {
    for (const template of cfg.api.searchEndpoints) {
      const url = `${base}${template}`
        .replace("{base}", base)
        .replace("{q}", enc)
        .replace("{searchParam}", searchParam ?? "q")
        .replace("{limit}", String(limit));
      attempts.push(() => fetchJson(url, getFetchOpts(cfg, "search", { retries: 1 }, signal)));
    }
  } else {
    if (searchParam) {
      attempts.push(
        () => fetchJson(`${base}/search?${searchParam}=${enc}`, getFetchOpts(cfg, "search", { retries: 1 }, signal)),
        () => fetchJson(`${base}/search?${searchParam}=${enc}&limit=${limit}`, getFetchOpts(cfg, "search", { retries: 1 }, signal)),
        () => fetchJson(`${base}/manga?${searchParam}=${enc}`, getFetchOpts(cfg, "search", { retries: 1 }, signal)),
        () => fetchJson(`${base}/series?${searchParam}=${enc}`, getFetchOpts(cfg, "search", { retries: 1 }, signal)),
        () => fetchJson(`${base}/api/search?${searchParam}=${enc}`, getFetchOpts(cfg, "search", { retries: 1 }, signal)),
      );
    }
    attempts.push(
      () => fetchJson(`${base}/manga/list?page=1&page_size=50&q=${enc}`, getFetchOpts(cfg, "search", { retries: 1 }, signal)),
      () => fetchJson(`${base}/v1/manga/list?page=1&page_size=50&q=${enc}`, getFetchOpts(cfg, "search", { retries: 1 }, signal)),
      () => fetchJson(`${base}/series?title=${enc}&take=${limit}`, getFetchOpts(cfg, "search", { retries: 1 }, signal)),
      () => fetchJson(`${base}/search?q=${enc}&limit=${limit}`, getFetchOpts(cfg, "search", { retries: 1 }, signal)),
      () => fetchJson(`${base}/api/v1.0/search?q=${enc}&limit=${limit}`, getFetchOpts(cfg, "search", { retries: 1 }, signal)),
      () => fetchJson(`${base}/manga-list?q=${enc}&limit=${limit}`, getFetchOpts(cfg, "search", { retries: 1 }, signal)),
    );
  }

  const envelope = cfg.api?.envelope;
  const fieldMap  = cfg.api?.fieldMap;
  const idKeys    = fieldMap?.id      ?? ["manga_id", "id", "slug", "hid"];
  const titleKeys = fieldMap?.title   ?? ["title"];
  const coverKeys = fieldMap?.cover   ?? ["cover_image_url", "cover_portrait_url", "coverImage", "cover_url", "cover", "img"];
  const chapKeys  = fieldMap?.chapter ?? ["latest_chapter_number", "totalChapters", "total_chapters", "chapter_count", "last_chapter", "chapter"];
  const typeKeys  = fieldMap?.type    ?? ["type", "format"];
  const genreKeys = fieldMap?.genres  ?? ["genres", "genre"];

  for (const attempt of attempts) {
    try {
      const res = await attempt() as Record<string, unknown>;
      if (!res || typeof res !== "object") continue;

      if ((envelope === "retcode" || matchEnvelope(res, envelope)) && "retcode" in res) {
        const retcodeEnv = res as { retcode: number; data?: Record<string, unknown>[] };
        if (retcodeEnv.retcode !== 0 || !Array.isArray(retcodeEnv.data)) { if (envelope === "retcode") continue; }
        else {
          const items = retcodeEnv.data as Record<string, unknown>[];
          const mapped = items.map(item => {
            const nested = (item.data && typeof item.data === "object" && !Array.isArray(item.data))
              ? item.data as Record<string, unknown>
              : null;
            const rawCh = getField(item, chapKeys);
            const latestChapter = rawCh != null && !Number.isNaN(Number(rawCh)) ? Number(rawCh) : undefined;
            const alternativeTitle = (item.alternative_title as string | undefined)
              || (nested?.nativeTitle as string | undefined)
              || undefined;
            const tax = item.taxonomy as Record<string, { name: string }[]> | undefined;
            const genres = Array.isArray(tax?.Genre) ? tax!.Genre.map(genre => genre.name)
              : Array.isArray(getField(item, genreKeys)) ? (getField(item, genreKeys) as { name?: string }[]).map(genre => genre.name).filter((name): name is string => !!name)
              : undefined;
            const typeRaw = Array.isArray(tax?.Format) && tax!.Format.length > 0 ? tax!.Format[0].name : getField(item, typeKeys);
            const type = typeof typeRaw === "string" ? typeRaw || undefined : undefined;
            const seriesUpdatedAt = (
              item.latest_chapter_time ?? item.last_chapter_at ?? item.updated_at
            ) as string | undefined || undefined;
            return {
              id:          (getField(item, idKeys) ?? "") as string,
              title:       (getField(item, titleKeys) ?? "") as string,
              cover:       apiCover((getField(item, coverKeys) ?? "") as string, cfg),
              description: extractDesc(item, null),
              latestChapter, alternativeTitle, genres, type, seriesUpdatedAt,
              sourceId: cfg.id
            };
          }).filter(item => item.id && item.title);
          if (mapped.length > 0) return mapped;
          continue;
        }
      }

      const rawList = Array.isArray(res) ? res : (res.data ?? res.comics ?? res.results ?? res.posts);
      const list: Record<string, unknown>[] = Array.isArray(rawList) ? rawList as Record<string, unknown>[] : [];

      if (list.length > 0) {
        const mapped = list.map(item => {
          const nested = (item.data && typeof item.data === "object" && !Array.isArray(item.data))
            ? item.data as Record<string, unknown>
            : null;
          const urlId = (() => {
            const rawUrl = item.url;
            if (typeof rawUrl !== "string" || !rawUrl.includes("?")) return "";
            try { return new URL(rawUrl).searchParams.get("id") ?? ""; } catch { return ""; }
          })();
          const id    = (urlId || (nested?.slug ?? nested?.hid ?? (getField(item, idKeys) ?? ""))) as string;
          const rawTitle = (nested?.title ?? nested?.nativeTitle ?? (getField(item, titleKeys) ?? "")) as string;
          const title = dedupTitle(rawTitle);
          const cover = apiCover((nested?.coverImage ?? nested?.cover_image_url ?? nested?.cover ?? (getField(item, coverKeys) ?? "")) as string, cfg);
          const rawCh = nested?.totalChapters ?? nested?.latestChapter ?? getField(item, chapKeys);
          const latestChapter = rawCh != null && !Number.isNaN(Number(rawCh)) ? Number(rawCh) : undefined;
          const type = ((nested?.type ?? getField(item, typeKeys)) as string | undefined)?.toLowerCase() || undefined;
          const seriesUpdatedAt = ((nested?.lastUpdated ?? item.lastUpdated ?? nested?.lastChapterAddedAt ?? item.lastChapterAddedAt ?? nested?.updatedAt ?? item.updatedAt) as string | undefined) || undefined;
          const rawGenres = getField(item, genreKeys);
          const genres = Array.isArray(rawGenres)
            ? (rawGenres as { name?: string }[]).map(genre => (typeof genre === "string" ? genre : genre.name ?? "").trim()).filter(Boolean)
            : undefined;
          const rawAltTitles = (item.alternativeTitles ?? item.alternative_titles ?? item.alternativeTitle ?? item.alternative_title ?? nested?.nativeTitle) as string | undefined;
          const alternativeTitle = rawAltTitles?.trim() || undefined;
          return { id, title, cover, description: extractDesc(item, nested), latestChapter, type, genres, seriesUpdatedAt, alternativeTitle, sourceId: cfg.id };
        }).filter(item => item.id && item.title);
        if (mapped.length > 0) return mapped;
      }
    } catch {}
  }
  return [];
}
