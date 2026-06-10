import type { Request, Response } from "express";
import type { ChaptersPayload, PagesPayload, TitleInfoPayload, SourceInfo, SearchResult } from "../../shared/types.js";
import { getChaptersResult, getPagesResult, getTitleInfo, searchTitle } from "../services/scraperService.js";
import { listConfigs } from "../services/sourceConfigService.js";
import { listAdapters, listAdapterInstances } from "../adapters/index.js";
import { CACHE } from "../services/cacheService.js";
import { getConcurrencyStats } from "../services/fetchService.js";
import { getDohFailures } from "../services/dohService.js";
import { isResizeAvailable } from "./imgController.js";

const MAX_SOURCES_PER_REQUEST = Number(process.env.MAX_SEARCH_SOURCES ?? 10);
const MAX_RESULTS_PER_SOURCE  = Number(process.env.MAX_RESULTS_PER_SOURCE ?? 100);
const SEARCH_TIMEOUT_MS = 10_000;

export async function chaptersHandler(req: Request, res: Response) {
  const { sourceId, payload } = req.body as { sourceId: string; payload: ChaptersPayload };
  const clientAbort = new AbortController();
  const onClose = () => { if (!res.writableFinished) clientAbort.abort(); };
  res.on("close", onClose);
  res.on("finish", () => res.off("close", onClose));
  const { chapters, sourceError } = await getChaptersResult(sourceId, payload.titleId, clientAbort.signal);
  const isPartial = !!sourceError || chapters.length === 0;
  res.json({
    ok: true,
    data: chapters,
    total: chapters.length,
    partial: isPartial,
    ...(sourceError ? { warning: sourceError } : {}),
  });
}

export async function pagesHandler(req: Request, res: Response) {
  const { sourceId, payload } = req.body as { sourceId: string; payload: PagesPayload };
  const clientAbort = new AbortController();
  const onClose = () => { if (!res.writableFinished) clientAbort.abort(); };
  res.on("close", onClose);
  res.on("finish", () => res.off("close", onClose));
  const { pages, sourceError } = await getPagesResult(sourceId, payload.chapterId, clientAbort.signal);

  if (sourceError && pages.length === 0) {
    res.json({ ok: true, data: [], partial: true, warning: sourceError });
  } else {
    res.json({ ok: true, data: pages, partial: pages.length === 0 });
  }
}

export async function titleInfoHandler(req: Request, res: Response) {
  const { sourceId, payload } = req.body as { sourceId: string; payload: TitleInfoPayload };
  const titleInfo = await getTitleInfo(sourceId, payload.titleId);
  res.json({ ok: true, data: titleInfo });
}

export async function sourcesHandler(_req: Request, res: Response) {
  const configs = await listConfigs();
  const sourceList: SourceInfo[] = configs
    .map((cfg) => ({
      id: cfg.id,
      baseUrl: cfg.baseUrl,
      enabled: cfg.enabled,
      method: cfg.method,
      urlFormat: cfg.urlFormat,
      name: cfg.name ?? cfg.id.charAt(0).toUpperCase() + cfg.id.slice(1),
      language: cfg.language,
      contentRating: cfg.contentRating,
      note: cfg.note,
      color: cfg.color,
    }))
    .sort((srcA, srcB) =>
      srcA.enabled === srcB.enabled ? srcA.name.localeCompare(srcB.name) : Number(srcB.enabled) - Number(srcA.enabled)
    );

  res.json({ ok: true, data: sourceList });
}

export function healthHandler(_req: Request, res: Response) {
  const { hits, misses } = CACHE.stats();
  const adapters = listAdapters();
  res.json({
    ok: true,
    uptime: Math.round(process.uptime()),
    cacheHits: hits,
    cacheMisses: misses,
    ...getConcurrencyStats(),
    adaptersLoaded: adapters.length,
    adaptersEnabled: adapters.filter(adapter => adapter.enabled).length,
    dohFailures: getDohFailures(),
    imgResizeAvailable: isResizeAvailable(),
  });
}

export async function searchHandler(req: Request, res: Response) {
  const { sourceId, query, language, contentRating } = req.body as {
    sourceId?: string | null;
    query: string;
    language?: "id" | "en";
    contentRating?: "sfw" | "nsfw";
  };

  const clientAbort = new AbortController();
  // Abort only when the client disconnects before response. Listening on req fires too early.
  const onClose = () => {
    if (!res.writableFinished) clientAbort.abort();
  };
  res.on("close", onClose);
  // Drop the listener after responding to avoid retaining the AbortController past completion.
  res.on("finish", () => res.off("close", onClose));

  if (sourceId) {
    const adapterInfo = listAdapterInstances().find(adapter => adapter.info.id === sourceId)?.info;
    if (adapterInfo && contentRating && (adapterInfo.contentRating ?? "sfw") !== contentRating) {
      res.json({ ok: true, data: [] });
      return;
    }
    const results = await searchTitle(sourceId, query, clientAbort.signal);
    res.json({ ok: true, data: results });
    return;
  }

  const adapters = listAdapterInstances()
    .filter(adapter => (adapter.info.language ?? "id") === (language ?? "id"))
    .filter(adapter => !contentRating || (adapter.info.contentRating ?? "sfw") === contentRating)
    .slice(0, MAX_SOURCES_PER_REQUEST);

  const timeoutAbort = new AbortController();
  const timeoutId = setTimeout(() => timeoutAbort.abort(), SEARCH_TIMEOUT_MS);
  const signal = AbortSignal.any([clientAbort.signal, timeoutAbort.signal]);

  const settled = await Promise.allSettled(
    adapters.map(adapter =>
      searchTitle(adapter.info.id, query, signal).then(results => ({
        sourceId: adapter.info.id,
        results: results.slice(0, MAX_RESULTS_PER_SOURCE),
      }))
    )
  );
  clearTimeout(timeoutId);

  const sourceChunks = settled
    .filter((outcome): outcome is PromiseFulfilledResult<{ sourceId: string; results: SearchResult[] }> =>
      outcome.status === "fulfilled" && outcome.value.results.length > 0
    )
    .map(outcome => outcome.value);

  res.json({ ok: true, data: sourceChunks });
}
