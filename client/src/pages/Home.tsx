import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { FiRefreshCw, FiSearch, FiX, FiWifiOff } from "react-icons/fi";
import type { SearchResult } from "../../../shared/types.js";
import Card from "../components/ui/Card.js";
import SkeletonCard from "../components/ui/SkeletonCard.js";
import EmptyState from "../components/ui/EmptyState.js";
import Spinner from "../components/ui/Spinner.js";
import Pagination from "../components/ui/Pagination.js";
import { useDebounce } from "../hooks/useDebounce.js";
import { usePageSize } from "../hooks/usePageSize.js";
import { API } from "../lib/api.js";
import { useSourcesStore } from "../store/sources.js";
import { useUiStore } from "../store/ui.js";

function useOnlineStatus() {
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const on  = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online",  on);
    window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, []);
  return online;
}

export default function Home() {
  const sources         = useSourcesStore(state => state.sources);
  const sourcesError    = useSourcesStore(state => state.error);
  const language        = useUiStore(state => state.language);
  const setLanguage     = useUiStore(state => state.setLanguage);
  const contentRating   = useUiStore(state => state.contentRating);
  const setContentRating = useUiStore(state => state.setContentRating);
  const isOnline        = useOnlineStatus();
  const pageSize        = usePageSize();

  const [searchParams, setSearchParams] = useSearchParams();
  const [query, setQuery]               = useState(() => searchParams.get("q") ?? "");
  const debounced                       = useDebounce(query, 300);
  const [results, setResults]           = useState<SearchResult[]>([]);
  const [isLoading, setIsLoading]           = useState(false);
  const [hasSearched, setHasSearched]   = useState(false);
  const [streamError, setStreamError]   = useState<string | null>(null);
  const [retryCount, setRetryCount]     = useState(0);
  const [page, setPage]                 = useState(1);
  const inputRef                        = useRef<HTMLInputElement>(null);
  const prevDebouncedRef                = useRef(debounced);
  const prevLangRef                     = useRef(language);
  const prevRatingRef                   = useRef(contentRating);

  // Mirror into refs: setSearchParams identity is unstable and query/debounced change on every keystroke.
  const queryRef = useRef(query);
  const debouncedRef = useRef(debounced);
  const setSearchParamsRef = useRef(setSearchParams);
  useEffect(() => {
    queryRef.current = query;
    debouncedRef.current = debounced;
    setSearchParamsRef.current = setSearchParams;
  });

  // Source filter chips still work but are derived from result.sourceId, not per-request state
  const selectedSource = searchParams.get("source");
  const setSelectedSource = useCallback((id: string | null) => {
    setSearchParamsRef.current(prev => {
      const next = new URLSearchParams(prev);
      if (id) next.set("source", id);
      else next.delete("source");
      return next;
    }, { replace: true });
  }, []);

  useEffect(() => {
    document.title = "Librarytoon";
  }, []);

  useEffect(() => {
    if (!window.matchMedia("(hover: none)").matches) inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const urlQ = searchParams.get("q") ?? "";
    // Sync externally-changed URL ?q into the input only when it has settled to avoid clobbering mid-typing.
    if (urlQ && urlQ !== queryRef.current && debouncedRef.current === queryRef.current) {
      setQuery(urlQ);
    }
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
    const onKey = (event: KeyboardEvent) => {
      if (document.activeElement === inputRef.current) return;
      if (event.key === "/" || (event.key === "k" && (event.ctrlKey || event.metaKey))) {
        event.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    const trimmedQuery = debounced.trim();
    if (trimmedQuery.length < 2) {
      setResults([]);
      setHasSearched(false);
      setIsLoading(false);
      return;
    }

    if (debounced !== prevDebouncedRef.current || language !== prevLangRef.current || contentRating !== prevRatingRef.current) setSelectedSource(null);
    prevDebouncedRef.current = debounced;
    prevLangRef.current = language;
    prevRatingRef.current = contentRating;

    setResults([]);
    setHasSearched(true);
    setStreamError(null);
    setPage(1);
    setIsLoading(true);

    let isCancelled = false;
    const controller = new AbortController();
    const words = trimmedQuery.toLowerCase().split(/\s+/).filter(Boolean);

    API.search(trimmedQuery, { language, contentRating }, controller.signal)
      .then(chunks => {
        if (isCancelled) return;
        const all = chunks.flatMap(chunk => chunk.results).filter(item => {
          const haystack = `${item.title} ${item.alternativeTitle ?? ""}`.toLowerCase();
          return words.every(word => haystack.includes(word));
        });
        setResults(all);
      })
      .catch(err => { if (!isCancelled) setStreamError(String(err)); })
      .finally(() => { if (!isCancelled) setIsLoading(false); });

    return () => { isCancelled = true; controller.abort(); };
  }, [debounced, language, contentRating, setSelectedSource, retryCount]);

  useEffect(() => { setPage(1); }, [selectedSource]);

  const isIdle = !hasSearched;

  const countBySource = useMemo(() => {
    const countMap = new Map<string, number>();
    for (const item of results) countMap.set(item.sourceId, (countMap.get(item.sourceId) ?? 0) + 1);
    return countMap;
  }, [results]);

  const displayResults = useMemo(() => {
    if (selectedSource) return results.filter(item => item.sourceId === selectedSource);
    return results;
  }, [results, selectedSource]);

  const totalPages   = Math.ceil(displayResults.length / pageSize);
  const pagedResults = useMemo(
    () => displayResults.slice((page - 1) * pageSize, page * pageSize),
    [displayResults, page, pageSize]
  );

  const sourceNameMap = useMemo(() => {
    const nameMap = new Map<string, string>();
    for (const source of sources) nameMap.set(source.id, source.name ?? source.id);
    return nameMap;
  }, [sources]);

  const resultSourceIds = useMemo(() => [...countBySource.keys()], [countBySource]);

  return (
    <div className="min-h-[100dvh] bg-bg flex flex-col overflow-x-hidden">

      <div aria-live="polite" aria-atomic="false" className="sr-only">
        {results.length > 0 && `${results.length} results found`}
      </div>

      {!isOnline && (
        <div role="status" aria-live="polite"
          className="flex items-center justify-center gap-2 bg-yellow-500/10 border-b border-yellow-500/20 py-2 px-4 text-xs text-yellow-600 dark:text-yellow-400 font-semibold">
          <FiWifiOff size={13} />
          You&apos;re offline. Results may be unavailable until connection is restored.
        </div>
      )}

      {sourcesError && (
        <div role="alert" aria-live="assertive"
          className="flex items-center justify-center gap-2 bg-red-500/10 border-b border-red-500/20 py-2 px-4 text-xs text-red-600 dark:text-red-400 font-semibold">
          <FiWifiOff size={13} />
          Server unreachable. Check that the server is running.
        </div>
      )}

      <div
        className={`relative flex flex-col items-center transition-[padding,flex] duration-500 ease-in-out ${
          isIdle ? "justify-center flex-1 pb-28" : "pt-5 pb-0 mb-3"
        }`}
      >
        <div
          onClick={() => { if (!isIdle) setQuery(""); }}
          className={`text-center select-none transition-all duration-500 ${isIdle ? "mb-9" : "mb-4 cursor-pointer"}`}
        >
          <img
            src="/logo-white.png"
            alt="Librarytoon"
            draggable={false}
            className={`mx-auto transition-all duration-500 hidden dark:block ${isIdle ? "h-36 opacity-100" : "h-8 opacity-60"}`}
          />
          <img
            src="/logo-black.png"
            alt="Librarytoon"
            draggable={false}
            className={`mx-auto transition-all duration-500 block dark:hidden ${isIdle ? "h-36 opacity-100" : "h-8 opacity-60"}`}
          />
          <p className={`transition-all duration-500 ${
            isIdle ? "mt-3 text-sm font-semibold text-foreground/80 opacity-100 tracking-wide" : "opacity-0 h-0 mt-0 overflow-hidden"
          }`}>
            Librarytoon
          </p>
        </div>

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
              onChange={event => setQuery(event.target.value)}
              placeholder="Search across all sources..."
              aria-label="Search across all sources"
              aria-keyshortcuts="/"
              className="w-full bg-transparent text-foreground/80 placeholder:text-foreground/30
                         rounded-full pl-14 pr-40 py-4 text-base outline-none"
            />

            <span className="absolute right-5 top-1/2 -translate-y-1/2 flex items-center gap-2">
              <button
                onClick={() => setLanguage(language === "id" ? "en" : "id")}
                aria-label={`Language: ${language.toUpperCase()} (click to switch)`}
                className="w-7 text-center font-data text-sm font-bold tracking-widest text-foreground/40 hover:text-foreground active:text-foreground transition-colors"
              >
                {language.toUpperCase()}
              </button>
              <span aria-hidden className="text-foreground/20 text-sm">|</span>
              <button
                onClick={() => setContentRating(contentRating === "sfw" ? "nsfw" : "sfw")}
                aria-label={`Content rating: ${contentRating.toUpperCase()} (click to switch)`}
                className={`w-10 text-center font-data text-sm font-bold tracking-widest transition-colors ${
                  contentRating === "nsfw" ? "text-foreground" : "text-foreground/40 hover:text-foreground active:text-foreground"
                }`}
              >
                {contentRating.toUpperCase()}
              </button>
              {isLoading ? (
                <Spinner />
              ) : query.length > 0 ? (
                <button
                  onClick={() => setQuery("")}
                  className="text-foreground/30 hover:text-foreground/80 active:text-foreground/80 transition-colors"
                  aria-label="Clear search"
                >
                  <FiX size={15} />
                </button>
              ) : (
                <kbd className="hidden sm:flex items-center gap-0.5 font-data text-xs text-foreground/20 border border-foreground/10 rounded px-1.5 py-0.5">
                  /
                </kbd>
              )}
            </span>
          </div>

          {hasSearched && (results.length > 0 || isLoading) && (
            <div className="h-10 mt-2 flex flex-col justify-center">
              {results.length > 0 ? (
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

                    {resultSourceIds.map(srcId => {
                      const count      = countBySource.get(srcId) ?? 0;
                      const isSelected = selectedSource === srcId;
                      const srcName    = sourceNameMap.get(srcId) ?? srcId;

                      return (
                        <button
                          key={srcId}
                          onClick={() => setSelectedSource(isSelected ? null : srcId)}
                          aria-pressed={isSelected}
                          aria-label={`Filter by ${srcName}`}
                          className={`shrink-0 inline-flex items-center gap-1.5 ${isSelected ? "chip-active" : "chip-inactive"}`}
                        >
                          {srcName}
                          {count > 0 && (
                            <span className="font-data text-xs text-foreground/30">{count}</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                  <div aria-hidden className="pointer-events-none absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-bg to-transparent" />
                </div>
              ) : isLoading ? (
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

      {isLoading && results.length === 0 && (
        <div className="mx-auto w-full max-w-content px-6 pb-16">
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-4">
            {Array.from({ length: 12 }).map((_slot, idx) => <SkeletonCard key={idx} />)}
          </div>
        </div>
      )}

      {hasSearched && !isLoading && results.length === 0 && (
        <div className="mx-auto w-full max-w-content px-6 pb-16 mt-12">
          {streamError ? (
            <EmptyState
              icon={<FiSearch size={40} />}
              message="Search unavailable"
              hint={isOnline
                ? "The server had trouble reaching sources. Please try again in a moment."
                : "You appear to be offline. Check your connection and try again."}
              action={
                <button
                  onClick={() => setRetryCount(prev => prev + 1)}
                  className="mt-1 inline-flex items-center gap-1.5 text-xs text-foreground/40 hover:text-foreground/80 active:text-foreground/80 transition-colors"
                >
                  <FiRefreshCw size={12} />
                  Retry
                </button>
              }
            />
          ) : (
            <EmptyState
              icon={<FiSearch size={40} />}
              message={`No results for "${query}"`}
              hint="Try a different spelling or shorter title"
            />
          )}
        </div>
      )}

      {pagedResults.length > 0 && (
        <div className="mx-auto w-full max-w-content px-6 pb-20">
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-4">
            {pagedResults.map((item, idx) => (
              <div
                key={`${selectedSource ?? "all"}-p${page}-${item.sourceId}-${item.id}`}
                className="animate-fade-up"
                style={{ animationDelay: `${idx * 40}ms` }}
              >
                <Card item={item} />
              </div>
            ))}
          </div>
          <Pagination page={page} totalPages={totalPages} onPage={setPage} />
        </div>
      )}
    </div>
  );
}
