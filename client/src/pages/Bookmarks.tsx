import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { FiArrowDown, FiArrowUp, FiBookmark, FiSearch } from "react-icons/fi";
import type { SearchResult } from "../../../shared/types.js";
import Card from "../components/ui/Card.js";
import EmptyState from "../components/ui/EmptyState.js";
import Pagination from "../components/ui/Pagination.js";
import { usePageSize } from "../hooks/usePageSize.js";
import { type Bookmark, readBookmarks } from "../lib/bookmarkUtils.js";
import { useSourcesStore } from "../store/sources.js";
import { useUiStore } from "../store/ui.js";

export default function Bookmarks() {
  const pageSize    = usePageSize();
  const allSources  = useSourcesStore(state => state.sources);
  const language        = useUiStore(state => state.language);
  const setLanguage     = useUiStore(state => state.setLanguage);
  const contentRating   = useUiStore(state => state.contentRating);
  const setContentRating = useUiStore(state => state.setContentRating);
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [sortOrder, setSortOrder] = useState<"newest" | "oldest">("newest");
  const [page, setPage]           = useState(1);
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedSource = searchParams.get("source");

  const setSelectedSource = (id: string | null) => {
    setSearchParams(id ? { source: id } : {}, { replace: true });
  };

  useEffect(() => {
    document.title = "Bookmarks - Librarytoon";
    return () => { document.title = "Librarytoon"; };
  }, []);

  useEffect(() => {
    const list = readBookmarks();
    list.sort((itemA, itemB) => new Date(itemB.bookmarkedAt).getTime() - new Date(itemA.bookmarkedAt).getTime());
    setBookmarks(list);
  }, []);

  const langFiltered = useMemo(() =>
    bookmarks.filter(bookmark => {
      const src = allSources.find(source => source.id === bookmark.sourceId);
      return (src?.language ?? "id") === language && (src?.contentRating ?? "sfw") === contentRating;
    }),
  [bookmarks, language, contentRating, allSources]);

  // langFiltered is already sorted newest-first (see initial load). Reverse for oldest-first.
  const sorted = useMemo(() => {
    if (sortOrder === "oldest") return [...langFiltered].reverse();
    return langFiltered;
  }, [langFiltered, sortOrder]);

  const sources = useMemo(() => {
    const seen = new Map<string, string>();
    for (const bookmark of sorted) {
      if (!seen.has(bookmark.sourceId)) {
        const name = allSources.find(source => source.id === bookmark.sourceId)?.name ?? bookmark.sourceId;
        seen.set(bookmark.sourceId, name);
      }
    }
    return Array.from(seen.entries()).map(([id, name]) => ({ id, name }));
  }, [sorted, allSources]);

  const countBySource = useMemo(() => {
    const countMap = new Map<string, number>();
    for (const bookmark of sorted) countMap.set(bookmark.sourceId, (countMap.get(bookmark.sourceId) ?? 0) + 1);
    return countMap;
  }, [sorted]);

  const filtered = useMemo(() => {
    if (selectedSource) return sorted.filter(bookmark => bookmark.sourceId === selectedSource);
    return sorted;
  }, [sorted, selectedSource]);

  useEffect(() => { setPage(1); }, [sortOrder, selectedSource]);
  useEffect(() => { setSelectedSource(null); setPage(1); }, [language, contentRating]);

  const totalPages = Math.ceil(filtered.length / pageSize);
  const pagedItems = useMemo(
    () => filtered.slice((page - 1) * pageSize, page * pageSize),
    [filtered, page, pageSize]
  );

  return (
    <div className="min-h-full bg-bg flex flex-col overflow-x-hidden">

      <div className="border-b-2 border-dashed border-edge">
        <div className="mx-auto w-full max-w-content px-6 py-6 flex items-center justify-between gap-4">
          <h1 className="page-title flex items-center gap-2">
            <FiBookmark size={20} className="text-foreground/40" aria-hidden />
            Bookmarks
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
            <span aria-hidden className="text-foreground/30 text-sm">|</span>
            <button
              onClick={() => setSortOrder(sortOrder === "newest" ? "oldest" : "newest")}
              aria-label={`Sorted by ${sortOrder === "newest" ? "newest" : "oldest"} first (click to switch)`}
              className="flex items-center gap-1.5 text-sm font-semibold text-foreground/55 hover:text-foreground/80 active:text-foreground/80 transition-colors"
            >
              {sortOrder === "newest" ? "Newest" : "Oldest"}
              {sortOrder === "newest" ? <FiArrowDown size={14} aria-hidden /> : <FiArrowUp size={14} aria-hidden />}
            </button>
          </span>
        </div>
      </div>

      <div className="border-b-2 border-dashed border-edge">
        <div className="mx-auto w-full max-w-content px-6">
          <div className="relative">
            <div className="flex items-center gap-5 overflow-x-auto overflow-y-hidden scrollbar-thin">
              <button
                onClick={() => setSelectedSource(null)}
                aria-pressed={selectedSource === null}
                aria-label="Show all sources"
                className={selectedSource === null ? "filter-tab-active" : "filter-tab-inactive"}
              >
                All
              </button>

              {sources.map(src => {
                const count      = countBySource.get(src.id) ?? 0;
                const isSelected = selectedSource === src.id;

                return (
                  <button
                    key={src.id}
                    onClick={() => setSelectedSource(isSelected ? null : src.id)}
                    aria-pressed={isSelected}
                    aria-label={`Filter by ${src.name}`}
                    className={`inline-flex items-center gap-1.5 ${isSelected ? "filter-tab-active" : "filter-tab-inactive"}`}
                  >
                    {src.name}
                    {count > 0 && (
                      <span className="font-data text-[11px] normal-case text-foreground/45">{count}</span>
                    )}
                  </button>
                );
              })}
            </div>
            <div aria-hidden className="pointer-events-none absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-bg to-transparent" />
          </div>
        </div>
      </div>

      <div className="mx-auto w-full max-w-content px-6 pt-8 pb-20">
        {filtered.length === 0 ? (
          <div className="flex items-center justify-center min-h-[40vh]">
            <EmptyState
              icon={bookmarks.length === 0 ? <FiBookmark size={32} /> : <FiSearch size={32} />}
              message={bookmarks.length === 0 ? "No bookmarks found" : "No bookmarks match"}
              hint={bookmarks.length === 0 ? "Keep track of your favorite series here." : "Try a different source filter"}
            />
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 gap-3 sm:gap-4">
              {pagedItems.map((bookmark, idx) => {
                const item: SearchResult = {
                  id: bookmark.titleId,
                  sourceId: bookmark.sourceId,
                  title: bookmark.title,
                  cover: bookmark.cover,
                };
                return (
                  <div
                    key={`${selectedSource ?? "all"}-p${page}-${bookmark.sourceId}-${bookmark.titleId}`}
                    className="animate-fade-up"
                    style={{ animationDelay: `${idx * 40}ms` }}
                  >
                    <Card item={item} />
                  </div>
                );
              })}
            </div>
            <Pagination page={page} totalPages={totalPages} onPage={setPage} />
          </>
        )}
      </div>
    </div>
  );
}
