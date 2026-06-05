import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { FiArrowLeft, FiBookmark, FiSearch, FiX } from "react-icons/fi";
import type { SearchResult } from "../../../shared/types.js";
import Card from "../components/ui/Card.js";
import EmptyState from "../components/ui/EmptyState.js";
import Pagination from "../components/ui/Pagination.js";
import { usePageSize } from "../hooks/usePageSize.js";
import { KEYS, lsGet } from "../lib/storageKeys.js";
import { useSourcesStore } from "../store/sources.js";
import { useUiStore } from "../store/ui.js";

interface BookmarkItem {
  sourceId: string;
  titleId: string;
  title: string;
  cover: string;
  bookmarkedAt: string;
}

export default function Bookmarks() {
  const navigate    = useNavigate();
  const location    = useLocation();
  const pageSize    = usePageSize();
  const allSources  = useSourcesStore(state => state.sources);
  const language        = useUiStore(state => state.language);
  const setLanguage     = useUiStore(state => state.setLanguage);
  const contentRating   = useUiStore(state => state.contentRating);
  const setContentRating = useUiStore(state => state.setContentRating);
  const [bookmarks, setBookmarks] = useState<BookmarkItem[]>([]);
  const [search, setSearch]       = useState("");
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
    try {
      const parsed = JSON.parse(lsGet(KEYS.bookmarks) ?? "[]");
      const list = (Array.isArray(parsed) ? parsed : []).filter(
        (item): item is BookmarkItem =>
          typeof (item as BookmarkItem).sourceId === "string" &&
          typeof (item as BookmarkItem).titleId  === "string"
      );
      list.sort((itemA, itemB) => new Date(itemB.bookmarkedAt).getTime() - new Date(itemA.bookmarkedAt).getTime());
      setBookmarks(list);
    } catch {}
  }, []);

  const langFiltered = useMemo(() =>
    bookmarks.filter(bookmark => {
      const src = allSources.find(source => source.id === bookmark.sourceId);
      return (src?.language ?? "id") === language && (src?.contentRating ?? "sfw") === contentRating;
    }),
  [bookmarks, language, contentRating, allSources]);

  const searchFiltered = useMemo(() => {
    const trimmed = search.trim().toLowerCase();
    if (!trimmed) return langFiltered;
    return langFiltered.filter(bookmark => bookmark.title.toLowerCase().includes(trimmed));
  }, [langFiltered, search]);

  const sources = useMemo(() => {
    const seen = new Map<string, string>();
    for (const bookmark of searchFiltered) {
      if (!seen.has(bookmark.sourceId)) {
        const name = allSources.find(source => source.id === bookmark.sourceId)?.name ?? bookmark.sourceId;
        seen.set(bookmark.sourceId, name);
      }
    }
    return Array.from(seen.entries()).map(([id, name]) => ({ id, name }));
  }, [searchFiltered, allSources]);

  const countBySource = useMemo(() => {
    const countMap = new Map<string, number>();
    for (const bookmark of searchFiltered) countMap.set(bookmark.sourceId, (countMap.get(bookmark.sourceId) ?? 0) + 1);
    return countMap;
  }, [searchFiltered]);

  const filtered = useMemo(() => {
    if (selectedSource) return searchFiltered.filter(bookmark => bookmark.sourceId === selectedSource);
    return searchFiltered;
  }, [searchFiltered, selectedSource]);

  useEffect(() => { setPage(1); }, [search, selectedSource]);
  useEffect(() => { setSelectedSource(null); setPage(1); }, [language, contentRating]);

  const totalPages = Math.ceil(filtered.length / pageSize);
  const pagedItems = useMemo(
    () => filtered.slice((page - 1) * pageSize, page * pageSize),
    [filtered, page, pageSize]
  );

  return (
    <div className="mx-auto max-w-content px-6 py-10">
      <div className="mb-4">
        <div className="flex items-center justify-between mb-1">
          <button
            onClick={() => location.key === 'default' ? navigate('/') : navigate(-1)}
            className="inline-flex items-center gap-1.5 text-sm text-foreground/40 hover:text-foreground/80 active:text-foreground/80 transition-colors"
          >
            <FiArrowLeft size={20} />
            Back
          </button>
          <h1 className="text-sm font-bold text-foreground/90 tracking-wide">Bookmarks</h1>
        </div>
      </div>

      {bookmarks.length === 0 ? (
        <div className="flex items-center justify-center min-h-[50vh]">
          <EmptyState
            icon={<FiBookmark size={32} />}
            message="No bookmarks found"
            hint="Keep track of your favorite series here."
          />
        </div>
      ) : (
        <>
          <div className="mb-5 flex flex-col gap-3">
            <div className="flex items-center gap-2.5 rounded-full border border-dashed border-edge-bright bg-panel px-4 py-2.5 transition-colors focus-within:border-foreground/70">
              <FiSearch size={14} className="text-foreground/30 shrink-0" />
              <input
                type="text"
                placeholder="Search bookmarks..."
                value={search}
                onChange={event => setSearch(event.target.value)}
                className="flex-1 bg-transparent text-base sm:text-xs text-foreground/80 placeholder:text-foreground/30 outline-none"
                aria-label="Search bookmarks"
              />
              <button
                onClick={() => setLanguage(language === "id" ? "en" : "id")}
                aria-label={`Language: ${language.toUpperCase()} (click to switch)`}
                className="w-6 text-center font-data text-xs font-bold tracking-widest text-foreground/40 hover:text-foreground active:text-foreground transition-colors shrink-0"
              >
                {language.toUpperCase()}
              </button>
              <span aria-hidden className="text-foreground/20 text-xs shrink-0">|</span>
              <button
                onClick={() => setContentRating(contentRating === "sfw" ? "nsfw" : "sfw")}
                aria-label={`Content rating: ${contentRating.toUpperCase()} (click to switch)`}
                className={`w-9 text-center font-data text-xs font-bold tracking-widest transition-colors shrink-0 ${
                  contentRating === "nsfw" ? "text-foreground" : "text-foreground/40 hover:text-foreground active:text-foreground"
                }`}
              >
                {contentRating.toUpperCase()}
              </button>
              {search && (
                <button
                  onClick={() => setSearch("")}
                  className="text-foreground/30 hover:text-foreground/80 active:text-foreground/80 transition-colors shrink-0"
                  aria-label="Clear search"
                >
                  <FiX size={13} />
                </button>
              )}
            </div>

            {sources.length > 0 && (
              <div className="relative">
                <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-thin">
                  <button
                    onClick={() => setSelectedSource(null)}
                    aria-pressed={selectedSource === null}
                    aria-label="Show all sources"
                    className={`shrink-0 ${selectedSource === null ? "chip-active" : "chip-inactive"}`}
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
                        className={`shrink-0 inline-flex items-center gap-1.5 ${isSelected ? "chip-active" : "chip-inactive"}`}
                      >
                        {src.name}
                        <span className="font-data text-xs text-foreground/30">{count}</span>
                      </button>
                    );
                  })}
                </div>
                <div aria-hidden className="pointer-events-none absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-bg to-transparent" />
              </div>
            )}
          </div>

          {filtered.length === 0 ? (
            <div className="flex items-center justify-center min-h-[40vh]">
              <EmptyState
                icon={<FiSearch size={28} />}
                message="No bookmarks match"
                hint="Try a different search or source filter"
              />
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-4">
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
        </>
      )}
    </div>
  );
}
