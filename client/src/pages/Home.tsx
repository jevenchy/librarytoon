import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { FiBookOpen, FiBookmark, FiCheck, FiChevronLeft, FiChevronRight, FiCompass, FiImage, FiShare2, FiStar } from "react-icons/fi";
import type { SearchResult } from "../../../shared/types.js";
import Card from "../components/ui/Card.js";
import EmptyState from "../components/ui/EmptyState.js";
import MicroLabel from "../components/ui/MicroLabel.js";
import Pagination from "../components/ui/Pagination.js";
import SkeletonCard from "../components/ui/SkeletonCard.js";
import { API } from "../lib/api.js";
import { decodeHtml } from "../lib/htmlUtils.js";
import { resizeImageUrl } from "../lib/imageUrl.js";
import { readBookmarks, writeBookmarks } from "../lib/bookmarkUtils.js";
import { useSourcesStore } from "../store/sources.js";
import { useUiStore } from "../store/ui.js";

const SEED_TERMS = ["the", "love", "war", "boy", "she", "over", "my", "is", "bos"];

function pickSeed(): string {
  return SEED_TERMS[Math.floor(Math.random() * SEED_TERMS.length)];
}

function pickRandom<T>(items: readonly T[]): T | undefined {
  return items.length > 0 ? items[Math.floor(Math.random() * items.length)] : undefined;
}

const GRID_CLASS = "grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 gap-3 sm:gap-4";

// Mirrors GRID_CLASS responsive column counts so a "page" always lines up to exactly one row.
const GRID_COLUMN_QUERIES: Array<[string, number]> = [
  ["(min-width: 1280px)", 7],
  ["(min-width: 1024px)", 6],
  ["(min-width: 768px)", 5],
  ["(min-width: 640px)", 4],
];
const BASE_GRID_COLUMNS = 2;

function getGridColumns(): number {
  for (const [query, count] of GRID_COLUMN_QUERIES) {
    if (window.matchMedia(query).matches) return count;
  }
  return BASE_GRID_COLUMNS;
}

function useGridColumns(): number {
  const [cols, setCols] = useState(getGridColumns);
  useEffect(() => {
    const queries = GRID_COLUMN_QUERIES.map(([query]) => window.matchMedia(query));
    const recalc = () => setCols(getGridColumns());
    queries.forEach(mq => mq.addEventListener("change", recalc));
    return () => queries.forEach(mq => mq.removeEventListener("change", recalc));
  }, []);
  return cols;
}

function ThumbCover({ cover }: { cover?: string }) {
  const [isFailed, setIsFailed] = useState(false);
  if (!cover || isFailed) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-panel">
        <FiImage size={14} className="text-foreground/10" />
      </div>
    );
  }
  return (
    <img
      src={resizeImageUrl(cover, 200)}
      alt=""
      loading="lazy"
      decoding="async"
      onError={() => setIsFailed(true)}
      className="w-full h-full object-cover"
      draggable={false}
    />
  );
}

function FeaturedCarousel({ items }: { items: SearchResult[] }) {
  const sources = useSourcesStore(state => state.sources);
  const [index, setIndex] = useState(0);

  useEffect(() => { setIndex(0); }, [items]);

  const active = items[index];
  const activeKey = active ? `${active.sourceId}:${active.id}` : "";

  type Extra = Pick<SearchResult, "cover" | "type" | "genres" | "latestChapter">;
  const [extra, setExtra] = useState<Record<string, Extra | null>>({});
  const [isImageFailed, setIsImageFailed] = useState(false);

  const isComplete = (item: SearchResult) => Boolean(item.cover && item.type && item.genres?.length && item.latestChapter != null);

  useEffect(() => { setIsImageFailed(false); }, [activeKey]);

  useEffect(() => {
    if (!active || isComplete(active) || activeKey in extra) return;
    let cancelled = false;
    API.titleInfo(active.sourceId, active.id)
      .then(info => {
        if (cancelled) return;
        setExtra(prev => ({
          ...prev,
          [activeKey]: info
            ? { cover: active.cover || info.cover, type: info.type, genres: info.genres, latestChapter: info.latestChapter }
            : null,
        }));
      })
      .catch(() => { if (!cancelled) setExtra(prev => ({ ...prev, [activeKey]: null })); });
    return () => { cancelled = true; };
  }, [active, activeKey, extra]);

  const enrichment  = extra[activeKey];
  const isEnriching = active != null && !isComplete(active) && !(activeKey in extra);
  const cover         = active?.cover          || enrichment?.cover;
  const type          = active?.type          ?? enrichment?.type;
  const genres        = (active?.genres?.length ? active.genres : enrichment?.genres) ?? [];
  const latestChapter = active?.latestChapter  ?? enrichment?.latestChapter;

  const genresDisplay = useMemo(() => {
    const seen = new Set<string>();
    return genres.filter(genre => {
      const key = genre.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(0, 3);
  }, [genres]);

  const [isBookmarked, setIsBookmarked] = useState(false);
  useEffect(() => {
    setIsBookmarked(active
      ? readBookmarks().some(bookmark => bookmark.sourceId === active.sourceId && bookmark.titleId === active.id)
      : false);
  }, [active]);

  const toggleBookmark = () => {
    if (!active) return;
    const bookmarks = readBookmarks();
    const foundIndex = bookmarks.findIndex(bookmark => bookmark.sourceId === active.sourceId && bookmark.titleId === active.id);
    if (foundIndex >= 0) {
      bookmarks.splice(foundIndex, 1);
      setIsBookmarked(false);
    } else {
      bookmarks.push({
        sourceId: active.sourceId,
        titleId: active.id,
        title: active.title,
        cover: cover ?? "",
        bookmarkedAt: new Date().toISOString(),
      });
      setIsBookmarked(true);
    }
    writeBookmarks(bookmarks);
  };

  const [isShared, setIsShared] = useState(false);
  const handleShare = () => {
    if (!active) return;
    const url = `${window.location.origin}/detail/${active.sourceId}/${encodeURIComponent(active.id)}`;
    if (navigator.share) {
      navigator.share({ title: decodeHtml(active.title), url }).catch(() => {});
      return;
    }
    navigator.clipboard.writeText(url)
      .then(() => setIsShared(true))
      .catch(() => {})
      .finally(() => setTimeout(() => setIsShared(false), 2000));
  };

  if (items.length === 0) return null;
  const source = sources.find(src => src.id === active.sourceId);
  const detailPath = `/detail/${active.sourceId}/${encodeURIComponent(active.id)}`;

  const showPrev = () => setIndex(prev => (prev - 1 + items.length) % items.length);
  const showNext = () => setIndex(prev => (prev + 1) % items.length);

  return (
    <div className="rounded-card-outer bg-panel p-2 transition-colors">
      <div className="relative overflow-hidden rounded-card-inner border-2 border-dashed border-edge-bright">
        <div aria-hidden className="absolute inset-0">
          {cover && !isImageFailed && (
            <img
              src={resizeImageUrl(cover, 400)}
              alt=""
              loading="lazy"
              decoding="async"
              className="w-full h-full object-cover opacity-25 blur-sm"
              draggable={false}
            />
          )}
          <div
            className="absolute inset-0 sm:hidden"
            style={{ background: "linear-gradient(to top, rgba(0,0,0,0.92) 30%, rgba(0,0,0,0.35) 70%, transparent)" }}
          />
          <div
            className="absolute inset-0 hidden sm:block"
            style={{ background: "linear-gradient(to right, rgba(0,0,0,0.88) 25%, rgba(0,0,0,0.45) 65%, transparent)" }}
          />
        </div>

        <div className="absolute top-3 right-3 z-10 flex items-center gap-2">
          <button
            onClick={toggleBookmark}
            aria-label={isBookmarked ? "Remove bookmark" : "Add bookmark"}
            aria-pressed={isBookmarked}
            className={`w-10 h-10 flex items-center justify-center rounded-full backdrop-blur-sm transition-colors ${
              isBookmarked ? "bg-white/20 text-white" : "bg-black/25 text-white/70 hover:text-white hover:bg-black/45"
            }`}
          >
            <FiBookmark size={16} className={isBookmarked ? "fill-current" : ""} />
          </button>
          <button
            onClick={handleShare}
            aria-label="Share this pick"
            className="w-10 h-10 flex items-center justify-center rounded-full bg-black/25 text-white/70 hover:text-white hover:bg-black/45 backdrop-blur-sm transition-colors"
          >
            {isShared ? <FiCheck size={16} /> : <FiShare2 size={16} />}
          </button>
        </div>

        {items.length > 1 && (
          <>
            <button
              onClick={showPrev}
              aria-label="Previous pick"
              className="absolute left-3 top-1/2 -translate-y-1/2 z-10 w-10 h-10 flex items-center justify-center
                         rounded-full bg-black/25 text-white/70 hover:text-white hover:bg-black/45 backdrop-blur-sm transition-colors"
            >
              <FiChevronLeft size={20} />
            </button>
            <button
              onClick={showNext}
              aria-label="Next pick"
              className="absolute right-3 top-1/2 -translate-y-1/2 z-10 w-10 h-10 flex items-center justify-center
                         rounded-full bg-black/25 text-white/70 hover:text-white hover:bg-black/45 backdrop-blur-sm transition-colors"
            >
              <FiChevronRight size={20} />
            </button>
          </>
        )}

        <div className="relative flex flex-col items-center sm:flex-row sm:items-end gap-4 sm:gap-6 p-5 sm:p-6 min-h-[26rem] sm:min-h-[21rem]">
          <Link to={detailPath} state={active} className="self-center shrink-0 select-none">
            {cover && !isImageFailed ? (
              <img
                src={resizeImageUrl(cover, 400)}
                alt={active.title}
                loading="lazy"
                decoding="async"
                onError={() => setIsImageFailed(true)}
                className="w-40 sm:w-52 aspect-[3/4] object-cover rounded-card-inner border-2 border-dashed border-edge-bright shadow-lg"
                draggable={false}
              />
            ) : (
              <div className="w-40 sm:w-52 aspect-[3/4] rounded-card-inner border-2 border-dashed border-edge-bright shadow-lg
                              bg-panel flex flex-col items-center justify-center gap-1.5">
                <FiImage size={20} className="text-foreground/20" />
                <span className="text-xs text-foreground/30 uppercase tracking-wider">No cover</span>
              </div>
            )}
          </Link>

          <div className="flex-1 min-w-0 w-full sm:self-center pb-2 sm:pb-0 text-center sm:text-left">
            <div className="flex items-center gap-2 justify-center sm:justify-start">
              {source && (
                <MicroLabel
                  variant="badge"
                  color="overlay"
                  style={source.color
                    ? { borderColor: `${source.color}99`, color: "#fff", backgroundColor: `${source.color}77` }
                    : undefined}
                >
                  {active.sourceId}
                </MicroLabel>
              )}
              {isEnriching ? (
                <div className="h-[18px] w-14 rounded skeleton-shimmer" />
              ) : type && (
                <MicroLabel variant="badge" color="overlay" className="bg-black/50 backdrop-blur-sm capitalize">
                  {type}
                </MicroLabel>
              )}
            </div>
            <Link to={detailPath} state={active}>
              <h3 className="text-lg sm:text-xl font-bold text-white line-clamp-2 mt-2.5 hover:text-white/80 transition-colors">
                {decodeHtml(active.title)}
              </h3>
            </Link>
            {isEnriching ? (
              <div className="flex items-center gap-1.5 mt-3 justify-center sm:justify-start">
                <div className="h-[18px] w-16 rounded skeleton-shimmer" />
                <div className="h-[18px] w-14 rounded skeleton-shimmer" />
                <div className="h-[18px] w-12 rounded skeleton-shimmer" />
              </div>
            ) : genresDisplay.length > 0 && (
              <div className="flex items-center gap-1.5 mt-3 flex-wrap justify-center sm:justify-start">
                {genresDisplay.map(genre => (
                  <MicroLabel key={genre} variant="badge" color="overlay" className="bg-black/50 backdrop-blur-sm">
                    {genre}
                  </MicroLabel>
                ))}
              </div>
            )}
            {isEnriching ? (
              <div className="h-3 w-24 rounded skeleton-shimmer mt-3 mx-auto sm:mx-0" />
            ) : latestChapter != null && (
              <p className="flex items-center gap-1.5 mt-3 text-sm text-white/80 font-data justify-center sm:justify-start">
                <FiBookOpen size={14} aria-hidden />
                Chapter {latestChapter}
              </p>
            )}
          </div>

          {items.length > 1 && (
            <div className="hidden md:flex items-end gap-2 overflow-x-auto scrollbar-thin pb-1 max-w-[40%]">
              {items.map((item, idx) => (
                <button
                  key={`${item.sourceId}-${item.id}`}
                  onClick={() => setIndex(idx)}
                  aria-label={`Show ${item.title}`}
                  aria-pressed={idx === index}
                  className={`shrink-0 w-16 sm:w-20 aspect-[3/4] rounded-card-chapter overflow-hidden border-2 border-dashed transition-all duration-200 ${
                    idx === index ? "border-white" : "border-transparent opacity-45 hover:opacity-75"
                  }`}
                >
                  <ThumbCover cover={idx === index ? cover : item.cover} />
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  const sources          = useSourcesStore(state => state.sources);
  const language         = useUiStore(state => state.language);
  const setLanguage      = useUiStore(state => state.setLanguage);
  const contentRating    = useUiStore(state => state.contentRating);
  const setContentRating = useUiStore(state => state.setContentRating);

  const [topPicks, setTopPicks]   = useState<SearchResult[]>([]);
  const [bySource, setBySource]   = useState<SearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [selectedExploreSource, setSelectedExploreSource] = useState<string | null>(null);

  const explorePageSize = useGridColumns() * 3;
  const [explorePage, setExplorePage] = useState(1);

  const exploreSourceCounts = useMemo(() => {
    const countMap = new Map<string, number>();
    for (const item of bySource) countMap.set(item.sourceId, (countMap.get(item.sourceId) ?? 0) + 1);
    return countMap;
  }, [bySource]);
  const exploreSourceIds = useMemo(() => [...exploreSourceCounts.keys()], [exploreSourceCounts]);
  const exploreSourceNameMap = useMemo(() => {
    const nameMap = new Map<string, string>();
    for (const source of sources) nameMap.set(source.id, source.name ?? source.id);
    return nameMap;
  }, [sources]);

  const filteredBySource = useMemo(() =>
    selectedExploreSource ? bySource.filter(item => item.sourceId === selectedExploreSource) : bySource,
  [bySource, selectedExploreSource]);

  const exploreTotalPages = Math.max(1, Math.ceil(filteredBySource.length / explorePageSize));
  const explorePageItems = filteredBySource.slice((explorePage - 1) * explorePageSize, explorePage * explorePageSize);

  useEffect(() => { setExplorePage(1); setSelectedExploreSource(null); }, [bySource, explorePageSize]);
  useEffect(() => { setExplorePage(1); }, [selectedExploreSource]);

  useEffect(() => {
    document.title = "Librarytoon";
  }, []);

  const eligibleSources = useMemo(() =>
    sources.filter(src =>
      src.enabled &&
      (src.language ?? "id") === language &&
      (src.contentRating ?? "sfw") === contentRating
    ),
  [sources, language, contentRating]);

  useEffect(() => {
    if (eligibleSources.length === 0) {
      setTopPicks([]);
      setBySource([]);
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    const controller = new AbortController();
    setIsLoading(true);

    (async () => {
      const groups = await Promise.all(eligibleSources.map(async src => {
        const results = await API.search(pickSeed(), { sourceId: src.id }, controller.signal).catch(() => []);
        return { sourceId: src.id, results };
      }));
      if (cancelled) return;

      const withResults = groups.filter(group => group.results.length > 0);
      const topGroup = pickRandom(withResults);

      setTopPicks(topGroup ? topGroup.results.slice(0, 5) : []);
      setBySource(
        withResults
          .filter(group => group.sourceId !== topGroup?.sourceId)
          .flatMap(group => group.results.slice(0, 5))
      );
      setIsLoading(false);
    })();

    return () => { cancelled = true; controller.abort(); };
  }, [eligibleSources]);

  return (
    <div className="min-h-full bg-bg flex flex-col overflow-x-hidden">

      <div className="border-b-2 border-dashed border-edge">
        <div className="mx-auto w-full max-w-content px-6 py-6 flex items-center justify-between gap-4">
          <h1 className="page-title flex items-center gap-2">
            <FiStar size={20} className="text-foreground/40" aria-hidden />
            Discover
          </h1>
          <span className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => setLanguage(language === "id" ? "en" : "id")}
              aria-label={`Language: ${language.toUpperCase()} (click to switch)`}
              className="text-sm font-semibold text-foreground/55 hover:text-foreground/80 active:text-foreground/80 transition-colors min-w-[1.5rem] text-center"
            >
              {language.toUpperCase()}
            </button>
            <span aria-hidden className="text-foreground/30 text-sm">|</span>
            <button
              onClick={() => setContentRating(contentRating === "sfw" ? "nsfw" : "sfw")}
              aria-label={`Content rating: ${contentRating.toUpperCase()} (click to switch)`}
              className={`text-sm font-semibold transition-colors min-w-[2.5rem] text-center ${
                contentRating === "nsfw" ? "text-foreground/80" : "text-foreground/55 hover:text-foreground/80 active:text-foreground/80"
              }`}
            >
              {contentRating.toUpperCase()}
            </button>
          </span>
        </div>
      </div>

      <div className="mx-auto w-full max-w-content px-6 pt-8 pb-20">

        <section>
          {isLoading ? (
            <div className="rounded-card-outer bg-panel p-2 transition-colors">
              <div className="rounded-card-inner border-2 border-dashed border-edge-dim min-h-[calc(26rem+4px)] sm:min-h-[calc(21rem+4px)] skeleton-shimmer" />
            </div>
          ) : topPicks.length > 0 ? (
            <FeaturedCarousel items={topPicks} />
          ) : (
            <div className="flex items-center justify-center min-h-[30vh]">
              <EmptyState icon={<FiStar size={28} />} message="No picks available" hint="Try a different language or content rating" />
            </div>
          )}
        </section>

        <section className="mt-12">
          <h2 className="section-title flex items-center gap-2 mb-6">
            <FiCompass size={16} className="text-foreground/40" aria-hidden />
            Explore Sources
          </h2>

          {isLoading ? (
            <div className="flex items-center gap-5 mb-6">
              {[40, 80, 96, 80].map((width, idx) => (
                <div key={idx} className="shrink-0 py-3 border-b-2 border-transparent -mb-px">
                  <div className="h-[1.25rem] rounded skeleton-shimmer" style={{ width }} />
                </div>
              ))}
            </div>
          ) : exploreSourceIds.length > 1 && (
            <div className="relative mb-6">
              <div className="flex items-center gap-5 overflow-x-auto overflow-y-hidden scrollbar-thin">
                <button
                  onClick={() => setSelectedExploreSource(null)}
                  aria-pressed={selectedExploreSource === null}
                  aria-label="Show all sources"
                  className={selectedExploreSource === null ? "filter-tab-active" : "filter-tab-inactive"}
                >
                  All
                </button>

                {exploreSourceIds.map(srcId => {
                  const count      = exploreSourceCounts.get(srcId) ?? 0;
                  const isSelected = selectedExploreSource === srcId;
                  const srcName    = exploreSourceNameMap.get(srcId) ?? srcId;

                  return (
                    <button
                      key={srcId}
                      onClick={() => setSelectedExploreSource(isSelected ? null : srcId)}
                      aria-pressed={isSelected}
                      aria-label={`Filter by ${srcName}`}
                      className={`inline-flex items-center gap-1.5 ${isSelected ? "filter-tab-active" : "filter-tab-inactive"}`}
                    >
                      {srcName}
                      <span className="font-data text-xs normal-case text-foreground/45">{count}</span>
                    </button>
                  );
                })}
              </div>
              <div aria-hidden className="pointer-events-none absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-bg to-transparent" />
            </div>
          )}

          {isLoading ? (
            <div className={GRID_CLASS}>
              {Array.from({ length: explorePageSize }).map((_slot, idx) => <SkeletonCard key={idx} />)}
            </div>
          ) : bySource.length > 0 ? (
            <>
              <div className={GRID_CLASS}>
                {explorePageItems.map(item => <Card key={`src-${item.sourceId}-${item.id}`} item={item} />)}
              </div>
              <Pagination page={explorePage} totalPages={exploreTotalPages} onPage={setExplorePage} className="mt-4 sm:mt-6" />
            </>
          ) : (
            <div className="flex items-center justify-center min-h-[30vh]">
              <EmptyState icon={<FiCompass size={28} />} message="Nothing to explore yet" hint="Try a different language or content rating" />
            </div>
          )}
        </section>

      </div>
    </div>
  );
}
