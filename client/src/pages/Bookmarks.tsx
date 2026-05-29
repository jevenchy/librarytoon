import { useEffect, useMemo, useState } from "react";
import { KEYS } from "../lib/storageKeys.js";
import { Link, useSearchParams } from "react-router-dom";
import { FiChevronLeft, FiBookmark, FiSearch, FiX } from "react-icons/fi";
import Card from "../components/ui/Card.js";
import EmptyState from "../components/ui/EmptyState.js";
import Pagination from "../components/ui/Pagination.js";
import { PAGE_SIZE } from "../lib/pagination.js";
import type { SearchResult } from "../../../shared/types.js";

interface BookmarkItem {
  sourceId: string;
  titleId: string;
  title: string;
  cover: string;
  bookmarkedAt: string;
}

export default function Bookmarks() {
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
      const list = JSON.parse(localStorage.getItem(KEYS.bookmarks) ?? "[]") as BookmarkItem[];
      list.sort((a, b) => new Date(b.bookmarkedAt).getTime() - new Date(a.bookmarkedAt).getTime());
      setBookmarks(list);
    } catch {}
  }, []);

  const sources = useMemo(() => {
    const seen = new Map<string, string>();
    for (const b of bookmarks) {
      if (!seen.has(b.sourceId)) seen.set(b.sourceId, b.sourceId);
    }
    return Array.from(seen.entries()).map(([id, name]) => ({ id, name }));
  }, [bookmarks]);

  const countBySource = useMemo(() => {
    const m = new Map<string, number>();
    for (const b of bookmarks) m.set(b.sourceId, (m.get(b.sourceId) ?? 0) + 1);
    return m;
  }, [bookmarks]);

  const filtered = useMemo(() => {
    let result = bookmarks;
    if (selectedSource) result = result.filter(b => b.sourceId === selectedSource);
    const q = search.trim().toLowerCase();
    if (q) result = result.filter(b => b.title.toLowerCase().includes(q));
    return result;
  }, [bookmarks, selectedSource, search]);

  useEffect(() => { setPage(1); }, [search, selectedSource]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const pagedItems = useMemo(
    () => filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [filtered, page]
  );

  return (
    <div className="mx-auto max-w-content px-6 py-10 min-h-[100dvh] flex flex-col">
      <div className="mb-8">
        <div className="flex items-center justify-between mb-1">
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 text-sm text-foreground/40 hover:text-foreground/80 active:text-foreground/80 transition-colors"
          >
            <FiChevronLeft size={14} />
            Back
          </Link>
          <h1 className="text-sm font-bold text-foreground/90 tracking-wide">Bookmarks</h1>
        </div>
        <p className="mt-1 text-sm text-foreground/60">
          Your bookmarked series across all sources.
        </p>
      </div>

      {bookmarks.length === 0 ? (
        <div className="flex-1 flex items-center justify-center py-12">
          <EmptyState
            icon={<FiBookmark size={32} />}
            message="No bookmarks found"
            hint="Click the Bookmark button on any series detail page to save it here."
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
                onChange={e => setSearch(e.target.value)}
                className="flex-1 bg-transparent text-base sm:text-xs text-foreground/80 placeholder:text-foreground/30 outline-none"
                aria-label="Search bookmarks"
              />
              {search && (
                <button
                  onClick={() => setSearch("")}
                  className="text-foreground/30 hover:text-foreground/80 active:text-foreground/80 transition-colors"
                  aria-label="Clear search"
                >
                  <FiX size={13} />
                </button>
              )}
            </div>

            {sources.length > 1 && (
              <div className="relative">
                <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-thin">
                  <button
                    onClick={() => setSelectedSource(null)}
                    aria-pressed={selectedSource === null}
                    aria-label="Show all sources"
                    className={`shrink-0 transition-all duration-200 ${selectedSource === null ? "chip-active" : "chip-inactive"}`}
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
                        className={`shrink-0 inline-flex items-center gap-1.5 transition-all duration-200 ${isSelected ? "chip-active" : "chip-inactive"}`}
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
            <div className="flex-1 flex items-center justify-center py-12">
              <EmptyState
                icon={<FiSearch size={28} />}
                message="No bookmarks match"
                hint="Try a different search or source filter"
              />
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-4 pb-6">
                {pagedItems.map(b => {
                  const item: SearchResult = {
                    id: b.titleId,
                    sourceId: b.sourceId,
                    title: b.title,
                    cover: b.cover,
                  };
                  return (
                    <Card key={`${b.sourceId}-${b.titleId}`} item={item} />
                  );
                })}
              </div>
              <Pagination page={page} totalPages={totalPages} onPage={setPage} className="pb-16" />
            </>
          )}
        </>
      )}
    </div>
  );
}
