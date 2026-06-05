import type { SearchResult, SourceConfig } from "../../../shared/types.js";
import { fetchJson } from "../../services/fetchService.js";
import { getFetchOpts, extractDesc, fixMojibake, getField } from "../shared.js";
import { wordpressEnrichTitleFromBareArray } from "../wordpress/index.js";
import { apiBase, apiCover, dedupTitle, matchEnvelope } from "./index.js";

export async function apiTitleInfo(cfg: SourceConfig, titleId: string): Promise<SearchResult | null> {
  const base = apiBase(cfg);
  const envelope = cfg.api?.envelope;

  const attempts: Array<() => Promise<unknown>> = [];

  if (cfg.api?.titleInfoEndpoints && cfg.api.titleInfoEndpoints.length > 0) {
    for (const template of cfg.api.titleInfoEndpoints) {
      const url = `${base}${template}`
        .replace("{base}", base)
        .replace("{titleId}", encodeURIComponent(titleId));
      attempts.push(() => fetchJson(url, getFetchOpts(cfg, "search", { retries: 1 })));
    }
  }

  attempts.push(
    () => fetchJson(`${base}/series/${titleId}`,          getFetchOpts(cfg, "search", { retries: 1 })),
    () => fetchJson(`${base}/manga/firstEntry/${titleId}`,    getFetchOpts(cfg, "search", { retries: 1 })),
    () => fetchJson(`${base}/manga/${titleId}`,           getFetchOpts(cfg, "search", { retries: 1 })),
    () => fetchJson(`${base}/v1/manga/firstEntry/${titleId}`, getFetchOpts(cfg, "search", { retries: 1 })),
    () => fetchJson(`${base}/comic/${titleId}`,           getFetchOpts(cfg, "search", { retries: 1 })),
  );

  for (const attempt of attempts) {
    try {
      const res = await attempt() as Record<string, unknown>;

      if ((envelope === "retcode" || matchEnvelope(res, envelope)) && res && "retcode" in res) {
        const retcodeEnv = res as { retcode: number; data?: Record<string, unknown> };
        if (retcodeEnv.retcode !== 0 || !retcodeEnv.data) continue;
        const titleData = retcodeEnv.data;
        const id = (titleData.manga_id ?? titleData.id ?? titleData.slug ?? titleId) as string;
        const title = (titleData.title ?? titleId) as string;
        const cover = apiCover((titleData.cover_image_url ?? titleData.cover_portrait_url ?? titleData.coverImage ?? "") as string, cfg);
        const description = extractDesc(titleData, null);
        const latestChapter = titleData.latest_chapter_number != null ? Number(titleData.latest_chapter_number) : undefined;
        const alternativeTitle = (titleData.alternative_title as string | undefined) || undefined;
        const tax = titleData.taxonomy as Record<string, { name: string }[]> | undefined;
        const genres = Array.isArray(tax?.Genre) ? tax!.Genre.map(genre => genre.name) : undefined;
        const type = Array.isArray(tax?.Format) && tax!.Format.length > 0 ? tax!.Format[0].name : undefined;
        const seriesUpdatedAt = (
          titleData.latest_chapter_time ?? titleData.last_chapter_at ?? titleData.updated_at
        ) as string | undefined || undefined;
        if (title) return { id, title, cover, description, latestChapter, alternativeTitle, genres, type, seriesUpdatedAt, sourceId: cfg.id };
        continue;
      }

      if ((envelope === "success" || matchEnvelope(res, envelope)) && res && "success" in res && res.success === true) {
        const responseInfo = ((res.data as Record<string, unknown>)?.info) as Record<string, unknown> | undefined;
        if (responseInfo) {
          const id    = (responseInfo.slug ?? titleId) as string;
          const rawTitle = (responseInfo.title ?? titleId) as string;
          const title = dedupTitle(rawTitle);
          const cover = apiCover((responseInfo.coverImage ?? responseInfo.cover_image_url ?? "") as string, cfg);
          const description = extractDesc(responseInfo, null);
          const type = (responseInfo.type as string | undefined) || undefined;
          const genres = Array.isArray(responseInfo.genres) ? (responseInfo.genres as string[]) : undefined;
          const seriesUpdatedAt = (responseInfo.lastUpdated as string | undefined) || undefined;
          const chList = Array.isArray(responseInfo.chapters) ? responseInfo.chapters as Record<string, unknown>[] : [];
          const chNums = chList.map(entry => {
            const text = (entry.title ?? "") as string;
            const numMatch = text.match(/(\d+(?:\.\d+)?)\s*$/);
            return numMatch ? Number(numMatch[1]) : NaN;
          }).filter(num => !Number.isNaN(num));
          const latestChapter = chNums.length > 0 ? Math.max(...chNums) : undefined;
          if (title && title !== titleId) {
            return { id, title, cover, description, latestChapter, type, genres, seriesUpdatedAt, sourceId: cfg.id };
          }
        }
      }

      if (Array.isArray(res)) {
        const fieldMap  = cfg.api?.fieldMap;
        const idKeys    = fieldMap?.id    ?? ["manga_id", "id", "slug", "hid"];
        const titleKeys = fieldMap?.title ?? ["title"];
        const coverKeys = fieldMap?.cover ?? ["cover_image_url", "cover_portrait_url", "coverImage", "cover_url", "cover", "img"];
        const firstEntry = (res as unknown as Record<string, unknown>[])[0];
        if (firstEntry) {
          const rawTitle = (getField(firstEntry, titleKeys) ?? titleId) as string;
          const title = dedupTitle(rawTitle);
          const rawId = (getField(firstEntry, idKeys) ?? titleId) as string;
          const cover = apiCover((getField(firstEntry, coverKeys) ?? "") as string, cfg);
          const description = extractDesc(firstEntry, null);
          const type = (firstEntry.type as string | undefined) || undefined;
          const genres = Array.isArray(firstEntry.genre)
            ? (firstEntry.genre as Record<string, unknown>[])
                .map(genre => genre.name as string | undefined)
                .filter((name): name is string => typeof name === "string" && name.length > 0)
            : undefined;
          const chNums = Array.isArray(firstEntry.data)
            ? (firstEntry.data as Record<string, unknown>[])
                .map(entry => parseFloat(String(entry.chapter ?? "")))
                .filter(num => !Number.isNaN(num))
            : [];
          const latestChapter = chNums.length > 0 ? Math.max(...chNums) : undefined;

          let seriesUpdatedAt: string | undefined;
          let alternativeTitle: string | undefined;
          try {
            const enriched = await wordpressEnrichTitleFromBareArray(cfg, titleId);
            seriesUpdatedAt = enriched.seriesUpdatedAt;
            alternativeTitle = enriched.alternativeTitle;
          } catch {
            // WordPress post/dates enrichment failed. Returns without additional series fields.
          }

          if (title && title !== titleId) {
            return { id: rawId as string, title, cover, description, latestChapter, type, genres, seriesUpdatedAt, alternativeTitle, sourceId: cfg.id };
          }
        }
        continue;
      }

      // Flat top-level object with no envelope wrapper. Title and fields sit directly at the root.
      if (typeof res.title === "string" && (res.slug != null || res.id != null)) {
        const id = (res.slug ?? res.id ?? titleId) as string;
        const title = dedupTitle(res.title);
        const cover = apiCover((res.cover ?? res.coverImage ?? res.cover_image_url ?? "") as string, cfg);
        const description = extractDesc(res, null);
        const type = ((res.type ?? res.format) as string | undefined) || undefined;
        const genres = Array.isArray(res.genres)
          ? (res.genres as Array<string | { name?: string }>)
              .map(genre => (typeof genre === "string" ? genre : genre.name ?? "").trim())
              .filter(Boolean)
          : undefined;
        const rawAlt = (res.alternativeTitles ?? res.alternative_titles ?? res.nativeTitle) as string | undefined;
        const alternativeTitle = rawAlt ? fixMojibake(rawAlt).trim() || undefined : undefined;
        const seriesUpdatedAt = ((res.lastChapterAddedAt ?? res.updatedAt ?? res.updated_at) as string | undefined) || undefined;
        // Use chapterCount as the latestChapter proxy to avoid triggering a separate chapters fetch.
        const stats = res.stats as Record<string, unknown> | undefined;
        const rawCount = stats?.chapterCount ?? res.chapterCount ?? res.totalChapters;
        const latestChapter = rawCount != null && !Number.isNaN(Number(rawCount)) ? Number(rawCount) : undefined;
        if (title && title !== titleId) {
          return { id, title, cover, description, latestChapter, type, genres, alternativeTitle, seriesUpdatedAt, sourceId: cfg.id };
        }
      }

      const topData = res.data as Record<string, unknown> | undefined;
      const nested  = (topData?.data && typeof topData.data === "object")
        ? topData.data as Record<string, unknown>
        : topData;

      if (nested) {
        const id    = (nested.slug ?? nested.hid ?? nested.manga_id ?? nested.id ?? titleId) as string;
        const title = (nested.title ?? titleId) as string;
        const cover = apiCover((nested.coverImage ?? nested.cover_image_url ?? nested.cover ?? "") as string, cfg);
        const description = extractDesc(nested, null);
        const totalCh = nested.totalChapters != null ? parseInt(String(nested.totalChapters), 10) : NaN;
        const latestChapter = !Number.isNaN(totalCh) ? totalCh : undefined;
        const type = (nested.format as string | undefined) || undefined;
        const alternativeTitle = (nested.nativeTitle as string | undefined) || undefined;
        const genres = Array.isArray(nested.genres)
          ? (nested.genres as Record<string, unknown>[])
              .map(genre => {
                const gData = genre.data as Record<string, unknown> | undefined;
                return (gData?.name ?? genre.name) as string | undefined;
              })
              .filter((name): name is string => typeof name === "string" && name.length > 0)
          : undefined;
        const seriesUpdatedAt = (
          topData?.latestChapterAddedAt ?? topData?.latest_chapter_time ?? topData?.last_chapter_at ?? topData?.updatedAt
        ) as string | undefined || undefined;
        if (title && title !== titleId) {
          return { id: id as string, title, cover, description, latestChapter, type, alternativeTitle, genres, seriesUpdatedAt, sourceId: cfg.id };
        }
      }
    } catch {}
  }
  return null;
}
