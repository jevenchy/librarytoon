import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams, useLocation } from "react-router-dom";
import { FiArrowLeft, FiBookOpen, FiBookmark, FiList, FiRefreshCw, FiWifiOff } from "react-icons/fi";
import type { Chapter, SearchResult } from "../../../shared/types.js";
import ChapterList from "../components/reader/ChapterList.js";
import MicroLabel from "../components/ui/MicroLabel.js";
import EmptyState from "../components/ui/EmptyState.js";
import ErrorMessage from "../components/ui/ErrorMessage.js";
import { API } from "../lib/api.js";
import { KEYS, lsSet, lsGet } from "../lib/storageKeys.js";
import { useSourcesStore } from "../store/sources.js";
import { formatDate } from "../lib/dateUtils.js";
import { decodeHtml } from "../lib/htmlUtils.js";

function SkeletonDetail({ backTo }: { backTo: string }) {
  return (
    <div className="mx-auto max-w-content px-6 py-10">
      <div className="mb-8">
        <div className="flex items-center justify-between mb-1">
          <Link
            to={backTo}
            className="inline-flex items-center gap-1.5 text-sm text-foreground/40 hover:text-foreground/80 active:text-foreground/80 transition-colors"
          >
            <FiArrowLeft size={20} />
            Back
          </Link>
          <h1 className="text-sm font-bold text-foreground/90 tracking-wide">Detail</h1>
        </div>
        <div className="mt-2 h-4 w-48 rounded skeleton-shimmer" />
      </div>

      <div className="rounded-card-outer bg-panel p-2 mb-8">
        <div className="flex gap-4 rounded-2xl border border-dashed border-edge p-4">
          <div className="shrink-0 w-[120px] sm:w-[160px]">
            <div className="w-full aspect-[2/3] rounded-xl skeleton-shimmer" />
          </div>
          <div className="flex flex-col gap-2 flex-1 pt-0.5">
            <div className="h-4 w-3/4 rounded skeleton-shimmer" />
            <div className="h-3 w-1/2 rounded skeleton-shimmer" />
            <div className="flex flex-col gap-1.5 mt-2">
              <div className="h-3 w-2/5 rounded skeleton-shimmer" />
              <div className="h-3 w-1/4 rounded skeleton-shimmer" />
              <div className="h-3 w-3/5 rounded skeleton-shimmer" />
              <div className="h-3 w-1/5 rounded skeleton-shimmer" />
              <div className="h-3 w-1/4 rounded skeleton-shimmer" />
            </div>
          </div>
        </div>
      </div>
      <div className="flex items-center justify-center gap-1 text-xs font-semibold text-foreground/40 tracking-wider py-6">
        <span>Fetching data</span>
        <span className="inline-flex">
          <span className="dot-blink" style={{ animationDelay: "0s" }}>.</span>
          <span className="dot-blink" style={{ animationDelay: "0.2s" }}>.</span>
          <span className="dot-blink" style={{ animationDelay: "0.4s" }}>.</span>
        </span>
      </div>
    </div>
  );
}

type Bookmark = { sourceId: string; titleId: string; title: string; cover: string; bookmarkedAt: string };

function isBookmark(value: unknown): value is Bookmark {
  return (
    typeof value === "object" && value !== null &&
    typeof (value as Record<string, unknown>).sourceId === "string" &&
    typeof (value as Record<string, unknown>).titleId  === "string"
  );
}

function readBookmarks(): Bookmark[] {
  try {
    const raw = lsGet(KEYS.bookmarks) ?? "[]";
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isBookmark);
  } catch {
    return [];
  }
}

function writeBookmarks(bookmarks: Bookmark[]): void {
  lsSet(KEYS.bookmarks, JSON.stringify(bookmarks));
}

const META_CACHE_TTL = 30 * 60 * 1000;
const CHAPTERS_CACHE_TTL = 60 * 60 * 1000;

function readMetaCache(sourceId: string, titleId: string): SearchResult | null {
  try {
    const raw = lsGet(KEYS.metaCache(sourceId, titleId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { data: SearchResult; ts: number };
    if (Date.now() - parsed.ts > META_CACHE_TTL) {
      localStorage.removeItem(KEYS.metaCache(sourceId, titleId));
      return null;
    }
    return parsed.data;
  } catch { return null; }
}

function writeMetaCache(sourceId: string, titleId: string, meta: SearchResult) {
  lsSet(KEYS.metaCache(sourceId, titleId), JSON.stringify({ data: meta, ts: Date.now() }));
}

function readChaptersCache(sourceId: string, titleId: string): Chapter[] | null {
  try {
    const raw = lsGet(KEYS.chaptersCache(sourceId, titleId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { data: Chapter[]; ts: number };
    if (Date.now() - parsed.ts > CHAPTERS_CACHE_TTL) {
      localStorage.removeItem(KEYS.chaptersCache(sourceId, titleId));
      return null;
    }
    return parsed.data;
  } catch { return null; }
}

function writeChaptersCache(sourceId: string, titleId: string, chapters: Chapter[]) {
  lsSet(KEYS.chaptersCache(sourceId, titleId), JSON.stringify({ data: chapters, ts: Date.now() }));
}

type RouterState = (SearchResult & { _back?: string }) | null;

export default function Detail() {
  const { sourceId = "", titleId = "" } = useParams();
  const { state } = useLocation() as { state: RouterState };
  const { _back: backPath, ...routerMetaRaw } = (state ?? {}) as NonNullable<RouterState>;
  const routerMeta: SearchResult | null = routerMetaRaw.id ? (routerMetaRaw as SearchResult) : null;
  const decodedId  = decodeURIComponent(titleId);

  const [meta, setMeta] = useState<SearchResult | null>(() => {
    const cached = readMetaCache(sourceId, decodedId);
    // When navigating from search, routerMeta.cover is fresh and reliable.
    // Apply it over the cached cover so the banner is correct from the first render,
    // even if a previous visit cached a wrong cover (e.g. lazy-loaded placeholder).
    if (cached && routerMeta?.cover) return { ...cached, cover: routerMeta.cover };
    return cached ?? routerMeta ?? null;
  });
  const [chapters, setChapters] = useState<Chapter[]>(() => readChaptersCache(sourceId, decodedId) ?? []);
  const [error, setError]       = useState<string | null>(null);
  const [isReady, setIsReady]       = useState<boolean>(() => {
    // Skip skeleton when navigating from search: routerMeta already provides enough data.
    const hasMeta = Boolean(readMetaCache(sourceId, decodedId) ?? routerMeta);
    const hasCh   = (readChaptersCache(sourceId, decodedId)?.length ?? 0) > 0;
    return hasMeta && hasCh;
  });
  const [retryCount, setRetryCount] = useState(0);
  const [isRetrying, setIsRetrying]     = useState(false);
  const [isTimedOut, setIsTimedOut]     = useState(false);
  const [isBookmarked, setIsBookmarked] = useState(() => {
    return readBookmarks().some(bookmark => bookmark.sourceId === sourceId && bookmark.titleId === decodedId);
  });

  useEffect(() => {
    let isCancelled = false;
    const controller = new AbortController();
    setError(null);
    setIsTimedOut(false);

    const cachedMeta     = readMetaCache(sourceId, decodedId);
    const cachedChapters = readChaptersCache(sourceId, decodedId);

    const seedMeta = cachedMeta ?? routerMeta ?? null;
    // Apply fresh routerMeta.cover over any cached cover to avoid stale wrong-cover display.
    const seedDisplay = (seedMeta && routerMeta?.cover) ? { ...seedMeta, cover: routerMeta.cover } : seedMeta;
    if (seedDisplay) setMeta(seedDisplay);
    if (cachedChapters?.length) setChapters(cachedChapters);

    const hasFullCache = Boolean(seedMeta) && (cachedChapters?.length ?? 0) > 0;
    if (!hasFullCache) setIsReady(false);

    const timeoutId = !hasFullCache
      ? setTimeout(() => { if (!isCancelled) setIsTimedOut(true); }, 20_000)
      : null;

    // titleInfo carries full fields the search result omits. Only cache this response.
    const fetchMeta = API.titleInfo(sourceId, decodedId, controller.signal)
      .then(titleInfo => {
        if (!isCancelled && titleInfo) {
          // routerMeta.cover (fresh search result) is most reliable, prefer over possibly-stale cache.
          const merged = { ...titleInfo, cover: routerMeta?.cover || seedMeta?.cover || titleInfo.cover };
          setMeta(merged);
          writeMetaCache(sourceId, decodedId, merged);
        }
        return titleInfo;
      })
      .catch(() => null);

    const fetchChapters = API.chapters(sourceId, decodedId, controller.signal)
      .then(chaptersResult => {
        if (!isCancelled && chaptersResult.chapters.length > 0) {
          setChapters(chaptersResult.chapters);
          writeChaptersCache(sourceId, decodedId, chaptersResult.chapters);
        }
        return chaptersResult;
      })
      .catch(err => {
        if (!isCancelled && (cachedChapters?.length ?? 0) === 0) setError(String(err));
        return { chapters: [], total: 0, partial: false };
      });

    Promise.all([fetchMeta, fetchChapters]).finally(() => {
      if (timeoutId !== null) clearTimeout(timeoutId);
      if (!isCancelled) setIsReady(true);
    });

    return () => {
      isCancelled = true;
      controller.abort();
      if (timeoutId !== null) clearTimeout(timeoutId);
    };
  }, [sourceId, decodedId, retryCount]);

  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (retryTimerRef.current) clearTimeout(retryTimerRef.current); }, []);

  const retry = () => {
    setIsRetrying(true);
    if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    retryTimerRef.current = setTimeout(() => setIsRetrying(false), 800);
    setRetryCount(prev => prev + 1);
  };

  const title         = decodeHtml(meta?.title ?? decodedId.replace(/-/g, " ").replace(/\b\w/g, char => char.toUpperCase()))
    .replace(/^(manhwa|manga|manhua|komik|webtoon|baca|indonesia|english)[:\s-]+/i, "")
    .replace(/[:\s-]+(manhwa|manga|manhua|komik|webtoon|baca|indonesia|english)$/i, "")
    .trim();

  useEffect(() => {
    document.title = `${title} - Librarytoon`;
    return () => { document.title = "Librarytoon"; };
  }, [title]);

  const cover         = meta?.cover ?? "";
  const description   = meta?.description;
  const latestChapter = meta?.latestChapter;
  const detailSource   = useSourcesStore(state => state.sources.find(src => src.id === sourceId));
  const sourceColor    = detailSource?.color;
  const sourceLanguage = detailSource?.language;
  const genres           = meta?.genres ?? [];
  const type             = meta?.type;
  const updatedAt        = meta?.seriesUpdatedAt;
  const alternativeTitle = meta?.alternativeTitle;

  const altTitleDisplay = useMemo(() => {
    if (!alternativeTitle?.trim()) return null;
    const lower = title.toLowerCase();
    const parts = alternativeTitle.split(",").map(part => part.trim()).filter(Boolean);
    const deduped = parts.filter(part => part.toLowerCase() !== lower);
    return deduped.length > 0 ? deduped.slice(0, 3) : null;
  }, [alternativeTitle, title]);

  const genresDisplay = useMemo(() => {
    const seen = new Set<string>();
    return genres.filter(genre => {
      const key = genre.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(0, 6);
  }, [genres]);

  const derivedUpdatedAt = useMemo(() => {
    const latest = chapters
      .filter(chapter => chapter.chapterUpdatedAt)
      .sort((itemA, itemB) => new Date(itemB.chapterUpdatedAt!).getTime() - new Date(itemA.chapterUpdatedAt!).getTime())[0];
    return latest?.chapterUpdatedAt ?? updatedAt ?? null;
  }, [updatedAt, chapters]);

  const [lastReadId] = useState<string | null>(
    () => lsGet(KEYS.lastRead(sourceId, decodedId))
  );
  const lastReadChapter = useMemo(
    () => chapters.find(chapter => chapter.id === lastReadId) ?? null,
    [chapters, lastReadId]
  );
  const firstChapter = useMemo(
    () => chapters.length > 0
      ? [...chapters].sort((chap1, chap2) => chap1.number - chap2.number)[0]
      : null,
    [chapters]
  );

  const toggleBookmark = () => {
    const bookmarks = readBookmarks();
    const foundIndex = bookmarks.findIndex(bookmark => bookmark.sourceId === sourceId && bookmark.titleId === decodedId);
    if (foundIndex >= 0) {
      bookmarks.splice(foundIndex, 1);
      setIsBookmarked(false);
    } else {
      bookmarks.push({
        sourceId,
        titleId: decodedId,
        title: meta?.title ?? title,
        cover: meta?.cover ?? cover,
        bookmarkedAt: new Date().toISOString(),
      });
      setIsBookmarked(true);
    }
    writeBookmarks(bookmarks);
  };

  if (!isReady && isTimedOut) {
    return (
      <div className="min-h-[100dvh] bg-bg flex items-center justify-center sm:justify-start p-6 select-none">
        <EmptyState
          icon={<FiWifiOff size={40} />}
          message="Source unreachable"
          hint="This source may be blocked or temporarily down"
          action={
            <button
              onClick={() => { setIsTimedOut(false); setRetryCount(prev => prev + 1); }}
              className="mt-1 inline-flex items-center gap-1.5 text-xs text-foreground/40 hover:text-foreground/80 active:text-foreground/80 transition-colors"
            >
              <FiRefreshCw size={12} />
              Refresh
            </button>
          }
        />
      </div>
    );
  }

  if (!isReady) {
    return <SkeletonDetail backTo={backPath ?? "/"} />;
  }

  return (
    <div className="mx-auto max-w-content px-6 py-10">

      <div className="mb-4">
        <div className="flex items-center justify-between mb-1">
          <Link
            to={backPath ?? "/"}
            className="inline-flex items-center gap-1.5 text-sm text-foreground/40 hover:text-foreground/80 active:text-foreground/80 transition-colors"
          >
            <FiArrowLeft size={20} />
            Back
          </Link>
          <h1 className="text-sm font-bold text-foreground/90 tracking-wide">Detail</h1>
        </div>
      </div>

      <div className="rounded-card-outer bg-panel p-2 mb-4 transition-colors">
        <div className="flex flex-col sm:flex-row gap-4 rounded-2xl border border-dashed border-edge-bright p-4">

          <div className="shrink-0 w-[160px] mx-auto sm:mx-0">
            <div className="w-full aspect-[2/3] rounded-xl overflow-hidden border border-dashed border-edge bg-panel">
              {cover ? (
                <img src={cover} alt={title} className="w-full h-full object-cover" draggable={false} />
              ) : (
                <div className="w-full h-full flex items-center justify-center sm:justify-start">
                  <FiBookOpen size={28} className="text-foreground/20" />
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-col min-w-0 flex-1 gap-1">
            <h2 className="text-sm font-bold text-foreground/90 truncate">{title}</h2>
            {altTitleDisplay && (
              <p className="text-[11px] text-foreground/35 truncate">{altTitleDisplay.join(", ")}</p>
            )}

            <div className="flex flex-col gap-1.5 mt-2 text-xs">
              <div className="flex items-center gap-2">
                <span className="text-foreground/40 w-[72px] shrink-0">Source :</span>
                <div className="flex items-center gap-1">
                  <MicroLabel variant="badge" style={sourceColor ? { borderColor: `${sourceColor}99`, color: "#fff", backgroundColor: `${sourceColor}77` } : undefined}>
                    {sourceId}
                  </MicroLabel>
                  {sourceLanguage && <MicroLabel variant="badge" color="faint">{sourceLanguage}</MicroLabel>}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-foreground/40 w-[72px] shrink-0">Type :</span>
                <span className="font-data text-foreground/50 capitalize">{type ?? "-"}</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-foreground/40 w-[72px] shrink-0">Genre :</span>
                <span className="font-data text-foreground/50 capitalize">
                  {genresDisplay.length > 0 ? genresDisplay.join(", ") : "-"}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-foreground/40 w-[72px] shrink-0">Chapters :</span>
                <span className="font-data text-foreground/50">
                  {chapters.length > 0 ? chapters.length : (latestChapter ?? "-")}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-foreground/40 w-[72px] shrink-0">Updated :</span>
                <span className="font-data text-foreground/50">{formatDate(derivedUpdatedAt)}</span>
              </div>
            </div>

            {isReady && chapters.length > 0 && (
              <div className="flex items-center gap-2 mt-auto pt-3 sm:justify-end">
                <button
                  onClick={toggleBookmark}
                  className={`flex-1 sm:flex-none sm:w-[190px] whitespace-nowrap overflow-hidden justify-center sm:justify-start ${isBookmarked ? "btn-primary" : "btn-ghost"}`}
                  aria-label={isBookmarked ? "Remove bookmark" : "Add bookmark"}
                >
                  <FiBookmark size={14} className={isBookmarked ? "fill-current" : ""} />
                  {isBookmarked ? "Bookmarked" : "Bookmark"}
                </button>
                {lastReadChapter ? (
                  <Link
                    to={`/read/${sourceId}/${encodeURIComponent(decodedId)}/${encodeURIComponent(lastReadChapter.id)}`}
                    state={{ title }}
                    className="btn-primary flex-1 sm:flex-none sm:w-[190px] whitespace-nowrap overflow-hidden justify-center sm:justify-start"
                  >
                    <FiBookOpen size={14} />
                    Continue - Ch. {lastReadChapter.number}
                  </Link>
                ) : firstChapter ? (
                  <Link
                    to={`/read/${sourceId}/${encodeURIComponent(decodedId)}/${encodeURIComponent(firstChapter.id)}`}
                    state={{ title }}
                    className="btn-primary flex-1 sm:flex-none sm:w-[190px] whitespace-nowrap overflow-hidden justify-center sm:justify-start"
                  >
                    <FiBookOpen size={14} />
                    Start reading
                  </Link>
                ) : null}
              </div>
            )}
          </div>

        </div>
      </div>

      {error && (
        <ErrorMessage
          message={error}
          className="w-full mb-4"
          action={
            <button
              onClick={retry}
              className="mt-1 inline-flex items-center gap-1.5 text-xs text-foreground/40 hover:text-foreground/70 active:text-foreground/70 transition-colors"
            >
              <FiRefreshCw size={14} className={isRetrying ? "animate-spin" : ""} />
              Retry
            </button>
          }
        />
      )}

      {!error && chapters.length === 0 && isReady && (
        <EmptyState
          icon={<FiList size={28} />}
          message="No chapters found"
          hint="This source may be temporarily unavailable"
          action={
            <button
              onClick={retry}
              className="mt-1 inline-flex items-center gap-1.5 text-xs text-foreground/40 hover:text-foreground/70 active:text-foreground/70 transition-colors"
            >
              <FiRefreshCw size={14} className={isRetrying ? "animate-spin" : ""} />
              Retry
            </button>
          }
        />
      )}

      {chapters.length > 0 && (
        <ChapterList chapters={chapters} sourceId={sourceId} titleId={decodedId} titleName={title} backPath={backPath} description={description} />
      )}

    </div>
  );
}
