import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { FiSearch, FiX } from "react-icons/fi";
import Card from "../components/ui/Card.js";
import SkeletonCard from "../components/ui/SkeletonCard.js";
import EmptyState from "../components/ui/EmptyState.js";
import Spinner from "../components/ui/Spinner.js";
import Pagination from "../components/ui/Pagination.js";
import { useDebounce } from "../hooks/useDebounce.js";
import { api } from "../lib/api.js";
import { PAGE_SIZE } from "../lib/pagination.js";
import { useSourcesStore } from "../store/sources.js";
import type { SearchResult } from "../../../shared/types.js";

type SourceStatus = "loading" | "done" | "error";

export default function Home() {
  const sources = useSourcesStore(s => s.sources);

  const [searchParams, setSearchParams] = useSearchParams();
  const [query, setQuery]               = useState(() => new URLSearchParams(window.location.search).get("q") ?? "");
  const debounced                       = useDebounce(query, 300);
  const [resultsBySource, setResultsBySource] = useState<Map<string, SearchResult[]>>(new Map());
  const [statuses, setStatuses] = useState<Map<string, SourceStatus>>(new Map());
  const [hasSearched, setHasSearched] = useState(false);
  const [page, setPage]               = useState(1);
  const inputRef                      = useRef<HTMLInputElement>(null);
  const prevDebouncedRef              = useRef(debounced);

  const selectedSource = searchParams.get("source");
  const setSelectedSource = (id: string | null) => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      if (id) next.set("source", id);
      else next.delete("source");
      return next;
    }, { replace: true });
  };

  useEffect(() => {
    document.title = "Librarytoon";
  }, []);

  useEffect(() => {
    if (!window.matchMedia("(hover: none)").matches) inputRef.current?.focus();
  }, []);

  // Sync URL query → input when navigating back/forward (e.g., browser back button)
  useEffect(() => {
    const urlQ = searchParams.get("q") ?? "";
    // Only sync from URL when user is NOT mid-type (debounced has caught up with query)
    // and the URL carries a real search query (prevents clearing input for short queries)
    if (urlQ && urlQ !== query && debounced === query) {
      setQuery(urlQ);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  useEffect(() => {
    const trimmed = query.trim();
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      if (trimmed.length >= 2) {
        next.set("q", trimmed);
      } else {
        next.delete("q");
        next.delete("source");
      }
      return next;
    }, { replace: true });
  }, [query, setSearchParams]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (document.activeElement === inputRef.current) return;
      if (e.key === "/" || (e.key === "k" && (e.ctrlKey || e.metaKey))) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const loading = useMemo(
    () => Array.from(statuses.values()).some(s => s === "loading"),
    [statuses]
  );

  useEffect(() => {
    const q = debounced.trim();
    if (q.length < 2) {
      setResultsBySource(new Map());
      setHasSearched(false);
      setStatuses(new Map());
      return;
    }
    if (sources.length === 0) return;

    setResultsBySource(new Map());
    setHasSearched(true);
    setPage(1);
    if (debounced !== prevDebouncedRef.current) setSelectedSource(null);
    prevDebouncedRef.current = debounced;
    setStatuses(new Map(sources.map(s => [s.id, "loading" as SourceStatus])));

    let cancelled = false;

    const SEARCH_TIMEOUT_MS = 10_000;

    for (const src of sources) {
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("timeout")), SEARCH_TIMEOUT_MS)
      );
      Promise.race([api.search(src.id, q), timeoutPromise])
        .then(data => {
          if (cancelled) return;
          const words = q.toLowerCase().split(/\s+/).filter(Boolean);
          const relevant = data.filter(r =>
            words.every(w => r.title.toLowerCase().includes(w))
          );
          if (relevant.length > 0) {
            setResultsBySource(prev => {
              const existing = prev.get(src.id) ?? [];
              const seen = new Set(existing.map(r => r.title.toLowerCase().trim()));
              const fresh = relevant.filter(r => !seen.has(r.title.toLowerCase().trim()));
              if (fresh.length === 0) return prev;
              const next = new Map(prev);
              next.set(src.id, [...existing, ...fresh]);
              return next;
            });
          }
          setStatuses(prev => new Map(prev).set(src.id, "done"));
        })
        .catch(() => {
          if (cancelled) return;
          setStatuses(prev => new Map(prev).set(src.id, "error"));
        });
    }

    return () => { cancelled = true; };
  }, [debounced, sources]);

  useEffect(() => { setPage(1); }, [selectedSource]);

  const idle = !hasSearched;

  const displayResults = useMemo(() => {
    if (selectedSource) return resultsBySource.get(selectedSource) ?? [];
    const seen = new Set<string>();
    const merged: SearchResult[] = [];
    for (const items of resultsBySource.values()) {
      for (const r of items) {
        const key = r.title.toLowerCase().trim();
        if (!seen.has(key)) { seen.add(key); merged.push(r); }
      }
    }
    return merged;
  }, [resultsBySource, selectedSource]);

  const countBySource = useMemo(() => {
    const m = new Map<string, number>();
    for (const [id, items] of resultsBySource) m.set(id, items.length);
    return m;
  }, [resultsBySource]);

  const totalResults = useMemo(() => {
    let n = 0;
    for (const items of resultsBySource.values()) n += items.length;
    return n;
  }, [resultsBySource]);

  const totalPages   = Math.ceil(displayResults.length / PAGE_SIZE);
  const pagedResults = useMemo(
    () => displayResults.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [displayResults, page]
  );

  return (
    <div className="min-h-[100dvh] bg-bg flex flex-col overflow-x-hidden">

      {/* Search area, transitions from center to top */}
      <div
        className={`relative flex flex-col items-center transition-[padding,flex] duration-500 ease-in-out ${
          idle ? "justify-center flex-1 pb-28" : "pt-5 pb-0 mb-3"
        }`}
      >
        {/* Logo */}
        <div className={`text-center select-none transition-all duration-500 ${idle ? "mb-9" : "mb-4"}`}>
          <img
            src="/logo-white.png"
            alt="Librarytoon"
            draggable={false}
            className={`mx-auto transition-all duration-500 hidden dark:block ${idle ? "h-36 opacity-100" : "h-8 opacity-60"}`}
          />
          <img
            src="/logo-black.png"
            alt="Librarytoon"
            draggable={false}
            className={`mx-auto transition-all duration-500 block dark:hidden ${idle ? "h-36 opacity-100" : "h-8 opacity-60"}`}
          />
          <p className={`transition-all duration-500 ${
            idle ? "mt-3 text-sm font-semibold text-foreground/80 opacity-100 tracking-wide" : "opacity-0 h-0 mt-0 overflow-hidden"
          }`}>
            Librarytoon
          </p>
        </div>

        {/* Search input */}
        <div className="mx-auto w-full max-w-content px-6">
          <div className="relative flex items-center bg-panel border border-dashed border-edge-bright rounded-full transition-colors focus-within:border-foreground/70">
            <FiSearch
              size={18}
              className="absolute left-5 top-1/2 -translate-y-1/2 pointer-events-none text-foreground/30"
              aria-hidden
            />
            <input
              ref={inputRef}
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search manhwa across all sources..."
              aria-label="Search manhwa across all sources"
              className="w-full bg-transparent text-foreground/80 placeholder:text-foreground/30
                         rounded-full pl-14 pr-14 py-4 text-base outline-none"
            />

            <span className="absolute right-5 top-1/2 -translate-y-1/2 flex items-center gap-2">
              {idle && !query && (
                <kbd className="hidden sm:flex items-center gap-0.5 font-data text-xs text-foreground/20 border border-foreground/10 rounded px-1.5 py-0.5">
                  /
                </kbd>
              )}
              {loading ? (
                <Spinner />
              ) : query.length > 0 ? (
                <button
                  onClick={() => setQuery("")}
                  className="text-foreground/30 hover:text-foreground/80 active:text-foreground/80 transition-colors"
                  aria-label="Clear search"
                >
                  <FiX size={15} />
                </button>
              ) : null}
            </span>
          </div>

          {/* Source filter chips and status area */}
          {hasSearched && (totalResults > 0 || loading) && (
            <div className="h-10 mt-2 flex flex-col justify-center">
              {totalResults > 0 ? (
                <div className="relative">
                  <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-thin">
                    <button
                      onClick={() => setSelectedSource(null)}
                      aria-pressed={selectedSource === null}
                      aria-label="Show all sources"
                      className={`shrink-0 transition-all duration-200 ${
                        selectedSource === null ? "chip-active" : "chip-inactive"
                      }`}
                    >
                      All
                    </button>

                    {sources.map(src => {
                      const status     = statuses.get(src.id);
                      const count      = countBySource.get(src.id) ?? 0;
                      const isLoading  = status === "loading";
                      const isError    = status === "error";
                      const isSelected = selectedSource === src.id;

                      if (count === 0 && !isSelected) return null;

                      return (
                        <button
                          key={src.id}
                          onClick={() => !isLoading && setSelectedSource(isSelected ? null : src.id)}
                          disabled={isLoading}
                          aria-pressed={isSelected}
                          aria-label={`Filter by ${src.id}`}
                          className={`shrink-0 inline-flex items-center gap-1.5 transition-all duration-200 ${
                            isError
                              ? "px-3 py-1 rounded-full text-xs border border-dashed border-danger/20 text-danger/50 cursor-default"
                              : isLoading
                              ? "px-3 py-1 rounded-full text-xs border border-dashed border-edge/40 text-foreground/20 cursor-default"
                              : isSelected
                              ? "chip-active"
                              : "chip-inactive"
                          }`}
                        >
                          {isLoading && <Spinner size="sm" />}
                          {src.id.charAt(0).toUpperCase() + src.id.slice(1)}
                          {!isLoading && !isError && count > 0 && (
                            <span className="font-data text-xs text-foreground/30">{count}</span>
                          )}
                          {isError && (
                            <span className="font-data text-xs text-danger/40">err</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                  <div aria-hidden className="pointer-events-none absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-bg to-transparent" />
                </div>
              ) : loading && totalResults === 0 ? (
                <div className="flex items-center justify-center gap-1 text-xs font-semibold text-foreground/40 tracking-wider">
                  <span>Searching</span>
                  <span className="inline-flex">
                    <span className="dot-blink" style={{ animationDelay: "0s" }}>.</span>
                    <span className="dot-blink" style={{ animationDelay: "0.2s" }}>.</span>
                    <span className="dot-blink" style={{ animationDelay: "0.4s" }}>.</span>
                  </span>
                </div>
              ) : null}
            </div>
          )}
        </div>
      </div>

      {/* Skeleton loading grid */}
      {loading && totalResults === 0 && (
        <div className="mx-auto w-full max-w-content px-6 pb-16">
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-4">
            {Array.from({ length: 12 }).map((_, i) => <SkeletonCard key={i} />)}
          </div>
        </div>
      )}

      {/* Empty state */}
      {hasSearched && !loading && totalResults === 0 && (
        <div className="mx-auto w-full max-w-content px-6 pb-16 mt-12">
          <EmptyState
            icon={<FiSearch size={40} />}
            message={`No results for "${query}"`}
            hint="Try a different spelling or shorter title"
          />
        </div>
      )}

      {/* Results grid */}
      {pagedResults.length > 0 && (
        <div className="mx-auto w-full max-w-content px-6 pb-20">
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-4">
            {pagedResults.map((r, i) => (
              <div
                key={`${r.sourceId}-${r.id}`}
                className="animate-fade-up"
                style={{ animationDelay: `${i * 40}ms` }}
              >
                <Card item={r} />
              </div>
            ))}
          </div>
          <Pagination page={page} totalPages={totalPages} onPage={setPage} />
        </div>
      )}
    </div>
  );
}
