import type { Page, SourceConfig } from "../../../shared/types.js";
import { fetchJson } from "../../services/fetchService.js";
import { getFetchOpts, proxyPageImage, processImageUrl, encodePathSegments } from "../shared.js";
import { apiBase, matchEnvelope } from "./index.js";

export async function apiPages(cfg: SourceConfig, chapterId: string, signal?: AbortSignal): Promise<Page[]> {
  const base = apiBase(cfg);
  const envelope = cfg.api?.envelope;
  const imageKeys = cfg.api?.pageFieldMap?.images ?? ["images", "image", "pages"];
  const slugSuffix = cfg.api?.slugSuffix ?? "";

  const sep = chapterId.lastIndexOf("/");
  const isComposite     = sep !== -1 && Number.isFinite(Number(chapterId.slice(sep + 1)));
  const isSlugComposite = sep !== -1 && !isComposite;
  const seriesSlug   = isComposite ? chapterId.slice(0, sep) : null;
  const chapterIndex = isComposite ? chapterId.slice(sep + 1) : null;

  const cParts = chapterId.split("/");
  const derivedChapterSlug = cParts[cParts.length - 1];
  let derivedSeriesSlug = "";
  if (cParts.length >= 3) {
    const raw = cParts.slice(1, -1).join("/");
    derivedSeriesSlug = slugSuffix && raw.endsWith(slugSuffix) ? raw.slice(0, -slugSuffix.length) : raw;
  } else if (cParts.length === 2) {
    const raw = cParts[0];
    derivedSeriesSlug = slugSuffix && raw.endsWith(slugSuffix) ? raw.slice(0, -slugSuffix.length) : raw;
  }

  const attempts: Array<() => Promise<unknown>> = [];

  if (cfg.api?.pageEndpoints && cfg.api.pageEndpoints.length > 0) {
    for (const template of cfg.api.pageEndpoints) {
      const url = `${base}${template}`
        .replace("{base}", base)
        .replace("{chapterId}", encodePathSegments(chapterId))
        .replace("{seriesSlug}", derivedSeriesSlug)
        .replace("{chapterSlug}", derivedChapterSlug);
      attempts.push(() => fetchJson(url, getFetchOpts(cfg, "pages", { retries: 1 }, signal)));
    }
  } else {
    if (isComposite) {
      attempts.push(() => fetchJson(`${base}/series/${seriesSlug}/chapters/${chapterIndex}`, getFetchOpts(cfg, "pages", { retries: 1 }, signal)));
    }
    if (isSlugComposite) {
      const beforeSlash = chapterId.slice(0, sep);
      const afterSlash  = chapterId.slice(sep + 1);
      attempts.push(() => fetchJson(`${base}/read/${beforeSlash}/${afterSlash}`, getFetchOpts(cfg, "pages", { retries: 1 }, signal)));
    }
    attempts.push(
      () => fetchJson(`${base}/chapter/detail/${chapterId}`, getFetchOpts(cfg, "pages", { retries: 1 }, signal)),
      () => fetchJson(`${base}/v1/chapter/detail/${chapterId}`, getFetchOpts(cfg, "pages", { retries: 1 }, signal)),
      () => fetchJson(`${base}/chapter/${chapterId}`, getFetchOpts(cfg, "pages", { retries: 1 }, signal)),
      () => fetchJson(`${base}/api/v1.0/chapter/${chapterId}`, getFetchOpts(cfg, "pages", { retries: 1 }, signal)),
    );
  }

  for (const attempt of attempts) {
    try {
      const res = await attempt() as Record<string, unknown>;

      if ((envelope === "retcode" || matchEnvelope(res, envelope)) && res && "retcode" in res) {
        const retcodeEnv = res as { retcode: number; data?: Record<string, unknown> };
        if (retcodeEnv.retcode !== 0 || !retcodeEnv.data) continue;
        const item = retcodeEnv.data as { base_url?: string; chapter?: { path?: string; data?: string[] } };
        const baseUrl = (item.base_url as string | undefined) || cfg.baseUrl;
        const path = item.chapter?.path || "";
        const files = item.chapter?.data;
        if (Array.isArray(files) && files.length > 0) {
          return files.map((imageFile, idx) => ({ chapterId, imageUrl: proxyPageImage(processImageUrl(`${baseUrl}${path}${imageFile}`, cfg), cfg), index: idx }));
        }
        continue;
      }

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
          const chapterObj = (dataObj?.chapter ?? raw.chapter) as Record<string, unknown> | undefined;
          const chapterImages = chapterObj?.images ?? chapterObj?.pages;
          if (Array.isArray(chapterImages)) {
            images = (chapterImages as { url?: string }[]).map(img => img.url ?? (img as unknown as string));
          }
        }
      }

      if (images.length > 0) {
        return images.map((url, idx) => {
          const imageUrl = processImageUrl(url.startsWith("http") ? url : `https:${url}`, cfg);
          return { chapterId, imageUrl: proxyPageImage(imageUrl, cfg), index: idx };
        });
      }
    } catch {}
  }
  return [];
}
