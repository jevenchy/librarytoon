import { useEffect, useMemo, useState } from "react";
import { Link, useParams, useLocation } from "react-router-dom";
import { FiChevronLeft, FiBookOpen, FiBookmark, FiList, FiRefreshCw, FiWifiOff } from "react-icons/fi";
import ChapterList from "../components/reader/ChapterList.js";
import MicroLabel from "../components/ui/MicroLabel.js";
import EmptyState from "../components/ui/EmptyState.js";
import ErrorMessage from "../components/ui/ErrorMessage.js";
import type { Chapter, SearchResult } from "../../../shared/types.js";
import { api } from "../lib/api.js";
import { KEYS } from "../lib/storageKeys.js";
import { useSourcesStore } from "../store/sources.js";

function SkeletonDetail({ backTo }: { backTo: string }) {
  return (
    <div className="mx-auto max-w-content px-6 py-10">
      <div className="mb-8">
        <div className="flex items-center justify-between mb-1">
          <Link
            to={backTo}
            className="inline-flex items-center gap-1.5 text-sm text-foreground/40 hover:text-foreground/80 active:text-foreground/80 transition-colors"
          >
            <FiChevronLeft size={14} />
            Back
          </Link>
          <h1 className="text-sm font-bold text-foreground/90 tracking-wide">Detail</h1>
        </div>
        <div className="mt-2 h-4 w-48 rounded skeleton-shimmer" />
      </div>

      <div className="rounded-3xl bg-panel p-2 mb-8">
        <div className="flex flex-col sm:flex-row gap-5 rounded-2xl border border-dashed border-edge p-5">
          <div className="rounded-3xl bg-panel p-2 flex-shrink-0 w-full max-w-[220px] mx-auto sm:mx-0 sm:w-[180px]">
            <div className="w-full aspect-[2/3] rounded-2xl skeleton-shimmer" />
          </div>
          <div className="flex flex-col gap-2 justify-start flex-1 mt-1">
            <div className="h-5 w-16 rounded skeleton-shimmer" />
            <div className="h-4 w-56 rounded skeleton-shimmer" />
            <div className="h-3 w-24 rounded skeleton-shimmer" />
            <div className="flex flex-col gap-1 mt-1">
              <div className="h-3 w-full rounded skeleton-shimmer" />
              <div className="h-3 w-5/6 rounded skeleton-shimmer" />
              <div className="h-3 w-4/6 rounded skeleton-shimmer" />
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

function decodeHtml(str: string): string {
  const txt = document.createElement("textarea");
  txt.innerHTML = str;
  return txt.value;
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const hours  = Math.floor(diff / 3_600_000);
  const days   = Math.floor(diff / 86_400_000);
  if (hours < 1)  return "just now";
  if (hours < 24) return `${hours}h ago`;
  if (days  < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return months < 12 ? `${months}mo ago` : `${Math.floor(months / 12)}y ago`;
}

const META_CACHE_TTL = 30 * 60 * 1000;
const CHAPTERS_CACHE_TTL = 60 * 60 * 1000;

function readMetaCache(sourceId: string, titleId: string): SearchResult | null {
  try {
    const raw = localStorage.getItem(KEYS.metaCache(sourceId, titleId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { data: SearchResult; ts: number };
    if (Date.now() - parsed.ts > META_CACHE_TTL) {
      localStorage.removeItem(KEYS.metaCache(sourceId, titleId));
      return null;
    }
    return parsed.data;
  } catch { return null; }
}

function writeMetaCache(sourceId: string, titleId: string, data: SearchResult) {
  try { localStorage.setItem(KEYS.metaCache(sourceId, titleId), JSON.stringify({ data, ts: Date.now() })); } catch {}
}

function readChaptersCache(sourceId: string, titleId: string): Chapter[] | null {
  try {
    const raw = localStorage.getItem(KEYS.chaptersCache(sourceId, titleId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { data: Chapter[]; ts: number };
    if (Date.now() - parsed.ts > CHAPTERS_CACHE_TTL) {
      localStorage.removeItem(KEYS.chaptersCache(sourceId, titleId));
      return null;
    }
    return parsed.data;
  } catch { return null; }
}

function writeChaptersCache(sourceId: string, titleId: string, data: Chapter[]) {
  try { localStorage.setItem(KEYS.chaptersCache(sourceId, titleId), JSON.stringify({ data, ts: Date.now() })); } catch {}
}

export default function Detail() {
  const { sourceId = "", titleId = "" } = useParams();
  const { state } = useLocation();
  const routerMeta = state as SearchResult | null;
  const backPath = (state as any)?._back as string | undefined;
  const decodedId  = decodeURIComponent(titleId);

  const [meta, setMeta] = useState<SearchResult | null>(() => {
    // Prefer cached meta (from a previous titleInfo fetch) over router state (search result).
    // Router state only carries minimal search fields (no genres, description, etc.),
    // so we never persist it to cache; only titleInfo responses are cached.
    const cached = readMetaCache(sourceId, decodedId);
    return cached ?? routerMeta ?? null;
  });
  const [chapters, setChapters] = useState<Chapter[]>(() => readChaptersCache(sourceId, decodedId) ?? []);
  const [error, setError]       = useState<string | null>(null);
  const [ready, setReady]       = useState<boolean>(() => {
    // Consider ready if we have ANY meta (cached or router state) AND cached chapters.
    // This avoids showing skeleton when navigating from search (routerMeta available).
    const hasMeta = Boolean(readMetaCache(sourceId, decodedId) ?? routerMeta);
    const hasCh   = (readChaptersCache(sourceId, decodedId)?.length ?? 0) > 0;
    return hasMeta && hasCh;
  });
  const [retryCount, setRetryCount] = useState(0);
  const [retrying, setRetrying]     = useState(false);
  const [timedOut, setTimedOut]     = useState(false);
  const [activeTab, setActiveTab] = useState<"info" | "description">("info");
  const [synopsisExpanded, setSynopsisExpanded] = useState(false);
  const [isBookmarked, setIsBookmarked] = useState(() => {
    try {
      const bookmarks = JSON.parse(localStorage.getItem(KEYS.bookmarks) ?? "[]") as any[];
      return bookmarks.some((b: any) => b.sourceId === sourceId && b.titleId === decodedId);
    } catch {
      return false;
    }
  });

  const syncDown = useSourcesStore(s => s.syncDown);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    setTimedOut(false);

    const cachedMeta     = readMetaCache(sourceId, decodedId);
    const cachedChapters = readChaptersCache(sourceId, decodedId);

    // Seed UI immediately with best available data (prefer full cache over minimal router state)
    const seedMeta = cachedMeta ?? routerMeta ?? null;
    if (seedMeta) setMeta(seedMeta);
    if (cachedChapters?.length) setChapters(cachedChapters);

    // Only show skeleton if we have neither cache nor chapters
    const hasFullCache = Boolean(seedMeta) && (cachedChapters?.length ?? 0) > 0;
    if (!hasFullCache) setReady(false);

    const timeoutId = !hasFullCache
      ? setTimeout(() => { if (!cancelled) setTimedOut(true); }, 10_000)
      : null;

    // Always fetch fresh titleInfo; it carries full detail fields (genres, description, etc.)
    // that search results don't include. Write to cache only from this response.
    const fetchMeta = api.titleInfo(sourceId, decodedId)
      .then(data => {
        if (!cancelled && data) {
          setMeta(data);
          writeMetaCache(sourceId, decodedId, data);
        }
        return data;
      })
      .catch(() => null);

    const fetchChapters = api.chapters(sourceId, decodedId)
      .then(data => {
        if (!cancelled && data.length > 0) {
          setChapters(data);
          writeChaptersCache(sourceId, decodedId, data);
        }
        return data;
      })
      .catch(err => {
        if (!cancelled && (cachedChapters?.length ?? 0) === 0) setError(String(err));
        return [];
      });

    Promise.all([fetchMeta, fetchChapters])
      .then(([, chs]) => {
        if (!cancelled && chs.length === 0)
          api.health().then(snap => { if (!cancelled) syncDown(snap.circuitOpen); }).catch(() => {});
      })
      .finally(() => {
        if (timeoutId !== null) clearTimeout(timeoutId);
        if (!cancelled) setReady(true);
      });

    return () => {
      cancelled = true;
      if (timeoutId !== null) clearTimeout(timeoutId);
    };
  }, [sourceId, decodedId, retryCount, syncDown]);

  const retry = () => {
    setRetrying(true);
    setTimeout(() => setRetrying(false), 800);
    setRetryCount(c => c + 1);
  };

  const title         = decodeHtml(meta?.title ?? decodedId.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase()));

  useEffect(() => {
    document.title = `${title} - Librarytoon`;
    return () => { document.title = "Librarytoon"; };
  }, [title]);

  const cover         = meta?.cover ?? "";
  const description   = meta?.description;
  const latestChapter = meta?.latestChapter;
  const label            = sourceId;
  const sourceColor      = useSourcesStore(s => s.sources.find(x => x.id === sourceId)?.color);
  const isDown           = useSourcesStore(s => s.downSources.has(sourceId));
  const genres           = meta?.genres ?? [];
  const type             = meta?.type;
  const updatedAt        = meta?.seriesUpdatedAt;
  const alternativeTitle = meta?.alternativeTitle;

  const altTitleDisplay = useMemo(() => {
    if (!alternativeTitle?.trim()) return null;
    const lower = title.toLowerCase();
    const parts = alternativeTitle.split(",").map(s => s.trim()).filter(Boolean);
    const deduped = parts.filter(p => p.toLowerCase() !== lower);
    return deduped.length > 0 ? deduped.slice(0, 3) : null;
  }, [alternativeTitle, title]);

  const genresDisplay = useMemo(() => {
    const seen = new Set<string>();
    return genres.filter(g => {
      const key = g.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(0, 6);
  }, [genres]);

  const derivedUpdatedAt = useMemo(() => {
    if (updatedAt) return updatedAt;
    const latest = chapters
      .filter(c => c.chapterUpdatedAt)
      .sort((a, b) => new Date(b.chapterUpdatedAt!).getTime() - new Date(a.chapterUpdatedAt!).getTime())[0];
    return latest?.chapterUpdatedAt ?? null;
  }, [updatedAt, chapters]);

  const lastReadId = (() => { try { return localStorage.getItem(KEYS.lastRead(sourceId, decodedId)); } catch { return null; } })();
  const lastReadChapter = useMemo(
    () => chapters.find(c => c.id === lastReadId) ?? null,
    [chapters, lastReadId]
  );
  const firstChapter = useMemo(
    () => chapters.length > 0
      ? [...chapters].sort((a, b) => a.number - b.number)[0]
      : null,
    [chapters]
  );

  const toggleBookmark = () => {
    try {
      const bookmarks = JSON.parse(localStorage.getItem(KEYS.bookmarks) ?? "[]") as any[];
      const foundIndex = bookmarks.findIndex((b: any) => b.sourceId === sourceId && b.titleId === decodedId);
      let nextBookmarks = [...bookmarks];
      if (foundIndex >= 0) {
        nextBookmarks.splice(foundIndex, 1);
        setIsBookmarked(false);
      } else {
        nextBookmarks.push({
          sourceId,
          titleId: decodedId,
          title: meta?.title ?? title,
          cover: meta?.cover ?? cover,
          bookmarkedAt: new Date().toISOString(),
        });
        setIsBookmarked(true);
      }
      localStorage.setItem(KEYS.bookmarks, JSON.stringify(nextBookmarks));
    } catch {}
  };

  if (!ready && timedOut) {
    return (
      <div className="min-h-[100dvh] bg-bg flex items-center justify-center p-6 select-none">
        <EmptyState
          icon={<FiWifiOff size={40} />}
          message="Source unreachable"
          hint="This source may be blocked or temporarily down"
          action={
            <button
              onClick={() => { setTimedOut(false); setRetryCount(c => c + 1); }}
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

  if (!ready) {
    return <SkeletonDetail backTo={backPath ?? "/"} />;
  }

  return (
    <div className="mx-auto max-w-content px-6 py-10">

      <div className="mb-8">
        <div className="flex items-center justify-between mb-1">
          <Link
            to={backPath ?? "/"}
            className="inline-flex items-center gap-1.5 text-sm text-foreground/40 hover:text-foreground/80 active:text-foreground/80 transition-colors"
          >
            <FiChevronLeft size={14} />
            Back
          </Link>
          <h1 className="text-sm font-bold text-foreground/90 tracking-wide">Detail</h1>
        </div>
        <p className="mt-1 text-sm text-foreground/60">
          {title.length > 30 ? title.slice(0, 30) + "..." : title}
        </p>
      </div>

      <div className="rounded-3xl bg-panel p-2 mb-4">
        <div className="flex flex-col sm:flex-row gap-5 rounded-2xl border border-dashed border-edge-bright p-5">

          <div className="rounded-3xl bg-panel p-2 flex-shrink-0 w-full max-w-[220px] mx-auto sm:mx-0 sm:w-[180px]">
            <div className="w-full aspect-[2/3] rounded-2xl overflow-hidden border border-dashed border-edge-bright bg-panel">
              {cover ? (
                <img
                  src={cover}
                  alt={title}
                  className="w-full h-full object-cover"
                  draggable={false}
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <FiBookOpen size={28} className="text-foreground/20" />
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-2 min-w-0 flex-1">

          <h2 className="text-sm font-bold text-foreground/85 leading-tight">{title}</h2>

          <p className="text-xs text-foreground/40 leading-snug -mt-1">
            {altTitleDisplay ? altTitleDisplay.join(", ") : "-"}
          </p>

          <div className="flex gap-4 border-b border-dashed border-edge mt-1">
            {(["info", "description"] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={[
                  "pb-1.5 text-xs font-semibold capitalize transition-colors border-b-2 -mb-px",
                  activeTab === tab
                    ? "border-foreground/60 text-foreground/80"
                    : "border-transparent text-foreground/35 hover:text-foreground/60"
                ].join(" ")}
              >
                {tab === "info" ? "Info" : "Description"}
              </button>
            ))}
          </div>

          {activeTab === "info" ? (
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-3 text-xs">
                <span className="text-foreground/40 w-16 shrink-0">Source :</span>
                <div className="flex items-center gap-1.5">
                  <MicroLabel
                    variant="badge"
                    style={sourceColor ? { borderColor: `${sourceColor}99`, color: "#fff", backgroundColor: `${sourceColor}77` } : undefined}
                  >
                    {label}
                  </MicroLabel>
                  {isDown && (
                    <MicroLabel variant="badge" color="danger">down</MicroLabel>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-3 text-xs">
                <span className="text-foreground/40 w-16 shrink-0">Type :</span>
                <span className="font-data text-foreground/50 capitalize">{type ?? "-"}</span>
              </div>
              <div className="flex items-start gap-3 text-xs">
                <span className="text-foreground/40 w-16 shrink-0">Genre :</span>
                {genresDisplay.length > 0 ? (
                  <span className="font-data text-foreground/50 capitalize">
                    {genresDisplay.join(", ")}
                  </span>
                ) : (
                  <span className="font-data text-foreground/30">-</span>
                )}
              </div>
              <div className="flex items-center gap-3 text-xs">
                <span className="text-foreground/40 w-16 shrink-0">Chapters :</span>
                {chapters.length > 0 || latestChapter != null ? (
                  <span className="font-data text-foreground/50">
                    {chapters.length > 0 ? chapters.length : latestChapter}
                  </span>
                ) : (
                  <span className="font-data text-foreground/30">-</span>
                )}
              </div>
              <div className="flex items-center gap-3 text-xs">
                <span className="text-foreground/40 w-16 shrink-0">Updated :</span>
                <span className="font-data text-foreground/50">
                  {derivedUpdatedAt ? relativeTime(derivedUpdatedAt) : "-"}
                </span>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              {description ? (
                <>
                  <p className="text-xs text-foreground/40 leading-relaxed">
                    {synopsisExpanded || description.length <= 400
                      ? description
                      : description.slice(0, 400) + "..."}
                  </p>
                  {description.length > 400 && (
                    <button
                      onClick={() => setSynopsisExpanded(v => !v)}
                      className="self-start text-xs text-foreground/35 hover:text-foreground/55 transition-colors"
                    >
                      {synopsisExpanded ? "Show less" : "Show more"}
                    </button>
                  )}
                </>
              ) : (
                <p className="text-xs text-foreground/40">No description available</p>
              )}
            </div>
          )}

          {ready && chapters.length > 0 && (
            <div className="flex items-center justify-end gap-2 mt-auto pt-2">
              <button
                onClick={toggleBookmark}
                className={isBookmarked ? "btn-primary" : "btn-ghost"}
                aria-label={isBookmarked ? "Remove bookmark" : "Add bookmark"}
              >
                <FiBookmark size={14} className={isBookmarked ? "fill-current" : ""} />
                {isBookmarked ? "Bookmarked" : "Bookmark"}
              </button>
              {lastReadChapter ? (
                <Link
                  to={`/read/${sourceId}/${encodeURIComponent(decodedId)}/${encodeURIComponent(lastReadChapter.id)}`}
                  state={{ title }}
                  className="btn-primary"
                >
                  <FiBookOpen size={14} />
                  Continue - Ch. {lastReadChapter.number}
                </Link>
              ) : firstChapter ? (
                <Link
                  to={`/read/${sourceId}/${encodeURIComponent(decodedId)}/${encodeURIComponent(firstChapter.id)}`}
                  state={{ title }}
                  className="btn-primary"
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
          sourceId={sourceId}
          className="w-full mb-4"
          action={
            <button
              onClick={retry}
              className="mt-1 inline-flex items-center gap-1.5 text-xs text-foreground/40 hover:text-foreground/70 active:text-foreground/70 transition-colors"
            >
              <FiRefreshCw size={14} className={retrying ? "animate-spin" : ""} />
              Retry
            </button>
          }
        />
      )}

      {!error && chapters.length === 0 && ready && (
        <EmptyState
          icon={<FiList size={28} />}
          message="No chapters found"
          hint={isDown ? "This source is currently down" : "This source may be temporarily unavailable"}
          action={
            <button
              onClick={retry}
              className="mt-1 inline-flex items-center gap-1.5 text-xs text-foreground/40 hover:text-foreground/70 active:text-foreground/70 transition-colors"
            >
              <FiRefreshCw size={14} className={retrying ? "animate-spin" : ""} />
              Retry
            </button>
          }
        />
      )}

      {chapters.length > 0 && (
        <ChapterList chapters={chapters} sourceId={sourceId} titleId={decodedId} titleName={title} backPath={backPath} />
      )}

    </div>
  );
}
