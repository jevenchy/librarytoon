import { useEffect, useMemo, useRef, useState, memo, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import { FiChevronLeft, FiChevronRight, FiChevronUp, FiChevronDown, FiList, FiArrowLeft, FiPlay, FiPause, FiSettings, FiX, FiSearch } from "react-icons/fi";
import type { Chapter, Page } from "../../../../shared/types.js";
import { KEYS, lsSet, lsGet, getStoredTheme } from "../../lib/storageKeys.js";
import { formatDate } from "../../lib/dateUtils.js";
import { preloadImages, resetPreloadCache } from "../../lib/imagePreloader.js";
import { decodeHtml } from "../../lib/htmlUtils.js";
import { SunIcon, MoonIcon } from "../ui/ThemeIcons.js";

type Props = {
  pages:             Page[];
  sourceId?:         string;
  titleId?:          string;
  titleName?:        string;
  chapters?:         Chapter[];
  chaptersLoading?:  boolean;
  chaptersError?:    boolean;
  currentChapterId?: string;
  uiVisible?:        boolean;
  backPath?:         string;
};

const ReaderImage = memo(function ReaderImage({
  src,
  index,
  totalPages,
}: {
  src:        string;
  index:      number;
  totalPages: number;
}) {
  const [isLoaded,   setIsLoaded]   = useState(false);
  const [isErrored,  setIsErrored]  = useState(false);

  return (
    <div className="w-full relative bg-bg" style={{ minHeight: isLoaded || isErrored ? undefined : 480 }}>
      {!isLoaded && !isErrored && (
        <div className="absolute inset-0 skeleton-shimmer" />
      )}
      {isErrored ? (
        <div className="flex items-center justify-center h-24 text-xs text-foreground/25 select-none">
          Page {index + 1} unavailable
        </div>
      ) : (
        <img
          src={src}
          alt={`Page ${index + 1} of ${totalPages}`}
          loading={index < 3 ? "eager" : "lazy"}
          decoding="async"
          draggable={false}
          onLoad={() => setIsLoaded(true)}
          onError={() => setIsErrored(true)}
          className={`block w-full h-auto select-none transition-opacity duration-300 ${
            isLoaded ? "opacity-100" : "opacity-0"
          }`}
          {...(index < 3 ? { fetchpriority: "high" } as Record<string, string> : {})}
        />
      )}
    </div>
  );
});

export default function Reader({
  pages,
  sourceId,
  titleId,
  titleName,
  chapters,
  chaptersLoading = false,
  chaptersError = false,
  currentChapterId,
  uiVisible = true,
  backPath,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const navigate = useNavigate();

  const [theme, setTheme] = useState<"dark" | "light">(getStoredTheme);
  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    document.documentElement.classList.remove("light", "dark");
    document.documentElement.classList.add(next);
    document.documentElement.style.colorScheme = next;
    try { lsSet(KEYS.theme, next); } catch {}
    setTheme(next);
  };

  useEffect(() => {
    resetPreloadCache();
    preloadImages(pages.slice(0, 5).map(page => page.imageUrl));
  }, [pages]);

  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;

    const observer = new IntersectionObserver(
      entries => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const idx = Number((entry.target as HTMLElement).dataset.index);
          // Preload next 4 images ahead only, bounded to avoid double-fetching lazy-loaded pages.
          preloadImages(pages.slice(idx + 1, idx + 5).map(page => page.imageUrl));
        }
      },
      { rootMargin: "600px" }
    );

    node.querySelectorAll<HTMLElement>("[data-index]").forEach(el => observer.observe(el));
    return () => observer.disconnect();
  }, [pages]);

  const { prevChapter, nextChapter } = useMemo(() => {
    if (!chapters?.length || !currentChapterId) return { prevChapter: null, nextChapter: null };
    const sorted = [...chapters].sort((chap1, chap2) => chap1.number - chap2.number);
    const idx = sorted.findIndex(chapter => chapter.id === currentChapterId);
    return {
      prevChapter: idx > 0 ? sorted[idx - 1] : null,
      nextChapter: idx !== -1 && idx < sorted.length - 1 ? sorted[idx + 1] : null,
    };
  }, [chapters, currentChapterId]);

  const base = sourceId && titleId ? `/read/${sourceId}/${encodeURIComponent(titleId)}` : null;

  // Ref tracks latest prop value so the keydown handler does not need a Zustand store call.
  const uiVisibleRef = useRef(uiVisible);
  useEffect(() => { uiVisibleRef.current = uiVisible; }, [uiVisible]);

  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
    if (event.key === "ArrowLeft" && prevChapter && base) {
      navigate(`${base}/${encodeURIComponent(prevChapter.id)}`, {
        state: { ...(titleName ? { title: titleName } : {}), ...(backPath ? { _back: backPath } : {}) }
      });
    } else if (event.key === "ArrowRight" && nextChapter && base) {
      navigate(`${base}/${encodeURIComponent(nextChapter.id)}`, {
        state: { ...(titleName ? { title: titleName } : {}), ...(backPath ? { _back: backPath } : {}) }
      });
    }
  }, [prevChapter, nextChapter, base, navigate, titleName, backPath]);

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  const currentChapter = useMemo(() => {
    if (!chapters?.length || !currentChapterId) return null;
    return chapters.find(chapter => chapter.id === currentChapterId) ?? null;
  }, [chapters, currentChapterId]);

  const [isAutoScrolling, setIsAutoScrolling] = useState(false);
  const [autoScrollSpeed, setAutoScrollSpeed] = useState(() => {
    const saved = Number(lsGet(KEYS.autoScrollSpeed));
    return saved >= 40 && saved <= 600 ? saved : 120;
  });
  const [isSpeedPanelVisible,   setIsSpeedPanelVisible]   = useState(false);
  const [isChapterPanelVisible, setIsChapterPanelVisible] = useState(false);
  const [chapterSearch,    setChapterSearch]    = useState("");
  const [isChapterSortDesc,  setIsChapterSortDesc]  = useState(true);

  const filteredChapters = useMemo(() => {
    const list = [...(chapters ?? [])].sort((chap1, chap2) =>
      isChapterSortDesc ? chap2.number - chap1.number : chap1.number - chap2.number
    );
    const query = chapterSearch.trim().toLowerCase();
    if (!query) return list;
    return list.filter(chapter =>
      String(chapter.number).includes(query) || chapter.title.toLowerCase().includes(query)
    );
  }, [chapters, chapterSearch, isChapterSortDesc]);
  const autoScrollRafRef = useRef<number | null>(null);
  const lastFrameTimeRef = useRef<number | null>(null);
  const scrollAccRef     = useRef(0);

  useEffect(() => {
    if (!isSpeedPanelVisible && !isChapterPanelVisible) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") { setIsSpeedPanelVisible(false); setIsChapterPanelVisible(false); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isSpeedPanelVisible, isChapterPanelVisible]);

  useEffect(() => {
    if (!isAutoScrolling) {
      if (autoScrollRafRef.current) cancelAnimationFrame(autoScrollRafRef.current);
      lastFrameTimeRef.current = null;
      scrollAccRef.current = 0;
      return;
    }
    const step = (time: number) => {
      if (lastFrameTimeRef.current !== null) {
        const delta = time - lastFrameTimeRef.current;
        scrollAccRef.current += (autoScrollSpeed * delta) / 1000;
        const toScroll = Math.floor(scrollAccRef.current);
        if (toScroll >= 1) {
          window.scrollBy(0, toScroll);
          scrollAccRef.current -= toScroll;
        }
        const atBottom =
          window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 2 ||
          document.body.scrollTop + window.innerHeight >= document.body.scrollHeight - 2;
        if (atBottom) {
          setIsAutoScrolling(false);
          return;
        }
      }
      lastFrameTimeRef.current = time;
      autoScrollRafRef.current = requestAnimationFrame(step);
    };
    lastFrameTimeRef.current = null;
    autoScrollRafRef.current = requestAnimationFrame(step);
    return () => { if (autoScrollRafRef.current) cancelAnimationFrame(autoScrollRafRef.current); };
  }, [isAutoScrolling, autoScrollSpeed]);

  const handleAutoScroll = () => {
    if (isAutoScrolling) {
      setIsAutoScrolling(false);
    } else {
      setIsSpeedPanelVisible(false);
      setIsAutoScrolling(true);
    }
  };

  if (pages.length === 0) {
    return (
      <div className="flex items-center justify-center py-24 text-xs text-white/40">
        No pages available for this chapter.
      </div>
    );
  }

  const detailUrl = sourceId && titleId ? `/detail/${sourceId}/${encodeURIComponent(titleId)}` : null;

  return (
    <>
      <div
        className={`fixed top-0 left-0 right-0 z-20
                    transition-transform duration-300 ${uiVisible && !(isSpeedPanelVisible || isChapterPanelVisible) ? "translate-y-0" : "-translate-y-full"}`}
      >
        <div className="max-w-reader mx-auto px-4 sm:px-6 py-3">
          <div className="rounded-card-outer bg-panel p-2">
            <div className="rounded-2xl border border-dashed border-edge-bright px-4 py-3">
              <div className="flex items-center gap-3">
                <Link
                  to={detailUrl ?? "/"}
                  state={backPath ? { _back: backPath } : undefined}
                  aria-label="Back"
                  className="inline-flex items-center justify-center w-8 h-8 rounded-full shrink-0
                             border border-dashed border-edge-bright text-foreground/50
                             hover:border-foreground/50 hover:text-foreground/80
                             active:border-foreground/50 active:text-foreground/80 transition-colors"
                >
                  <FiArrowLeft size={20} />
                </Link>
                <div className="flex-1 min-w-0">
                  {titleName && (
                    <p className="text-sm font-bold text-foreground/85 truncate leading-tight">
                      {(() => { const decoded = decodeHtml(titleName); return (<><span className="sm:hidden">{decoded.length > 22 ? decoded.slice(0, 22) + "..." : decoded}</span><span className="hidden sm:inline">{decoded.length > 44 ? decoded.slice(0, 44) + "..." : decoded}</span></>); })()}
                    </p>
                  )}
                  {currentChapter && (
                    <p className="text-xs font-semibold text-foreground/50 truncate leading-tight">
                      Chapter {currentChapter.number}
                    </p>
                  )}
                </div>
                <button
                  onClick={toggleTheme}
                  aria-label="Toggle theme"
                  className="inline-flex items-center justify-center w-8 h-8 rounded-full shrink-0
                             border border-dashed border-edge-bright text-foreground/50
                             hover:border-foreground/50 hover:text-foreground/80
                             active:border-foreground/50 active:text-foreground/80 transition-colors"
                >
                  {theme === "dark" ? <SunIcon size={18} /> : <MoonIcon size={18} />}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div
        ref={containerRef}
        className="reader-container mx-auto w-full max-w-reader px-0"
      >
        {pages.map((page, idx) => (
          <div key={`${page.chapterId}-${page.index}`} data-index={idx} className="reader-page">
            <ReaderImage src={page.imageUrl} index={idx} totalPages={pages.length} />
          </div>
        ))}
      </div>

      <div
        className={`fixed bottom-0 left-0 right-0 z-20
                    transition-transform duration-300 ${uiVisible && !(isSpeedPanelVisible || isChapterPanelVisible) ? "translate-y-0" : "translate-y-full"}`}
      >
        <div className="max-w-reader mx-auto px-4 sm:px-6 py-3 flex items-center justify-center gap-3">
          {prevChapter && base ? (
            <Link
              to={`${base}/${encodeURIComponent(prevChapter.id)}`}
              state={{ ...(titleName ? { title: titleName } : {}), ...(backPath ? { _back: backPath } : {}) }}
              aria-label={`Previous chapter ${prevChapter.number}`}
              className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-panel
                         outline outline-dashed outline-1 outline-edge-bright [outline-offset:-8px] text-foreground/50
                         hover:outline-foreground/50 hover:text-foreground/80
                         active:outline-foreground/50 active:text-foreground/80 transition-colors"
            >
              <FiChevronLeft size={20} />
            </Link>
          ) : (
            <span
              aria-disabled="true"
              className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-panel
                         outline outline-dashed outline-1 outline-edge-bright [outline-offset:-8px] text-foreground/15
                         pointer-events-none select-none"
            >
              <FiChevronLeft size={20} />
            </span>
          )}

          {(chaptersLoading || chaptersError || (chapters && chapters.length > 0)) && (
            <button
              onClick={() => setIsChapterPanelVisible(true)}
              aria-label="Chapter list"
              className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-panel
                         outline outline-dashed outline-1 outline-edge-bright [outline-offset:-8px] text-foreground/50
                         hover:outline-foreground/50 hover:text-foreground/80
                         active:outline-foreground/50 active:text-foreground/80 transition-colors"
            >
              <FiList size={20} />
            </button>
          )}

          {nextChapter && base ? (
            <Link
              to={`${base}/${encodeURIComponent(nextChapter.id)}`}
              state={{ ...(titleName ? { title: titleName } : {}), ...(backPath ? { _back: backPath } : {}) }}
              aria-label={`Next chapter ${nextChapter.number}`}
              className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-panel
                         outline outline-dashed outline-1 outline-edge-bright [outline-offset:-8px] text-foreground/50
                         hover:outline-foreground/50 hover:text-foreground/80
                         active:outline-foreground/50 active:text-foreground/80 transition-colors"
            >
              <FiChevronRight size={20} />
            </Link>
          ) : (
            <span
              aria-disabled="true"
              className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-panel
                         outline outline-dashed outline-1 outline-edge-bright [outline-offset:-8px] text-foreground/15
                         pointer-events-none select-none"
            >
              <FiChevronRight size={20} />
            </span>
          )}
        </div>
      </div>

      <div className={`fixed bottom-20 left-4 z-30 flex flex-col items-center gap-2
                        transition-opacity duration-300 ${(uiVisible || isAutoScrolling) && !(isSpeedPanelVisible || isChapterPanelVisible) ? "opacity-100" : "opacity-0 pointer-events-none"}`}>

        <button
          onClick={handleAutoScroll}
          aria-label={isAutoScrolling ? "Pause autoscroll" : "Start autoscroll"}
          className={`inline-flex items-center justify-center w-14 h-14 rounded-full bg-panel
                     outline outline-dashed outline-1 [outline-offset:-8px] transition-colors
                     ${isAutoScrolling
                       ? "outline-foreground/50 text-foreground/80"
                       : "outline-edge-bright text-foreground/50 hover:outline-foreground/50 hover:text-foreground/80 active:outline-foreground/50 active:text-foreground/80"
                     }`}
        >
          {isAutoScrolling ? <FiPause size={20} /> : <FiPlay size={20} />}
        </button>

        <button
          onClick={() => setIsSpeedPanelVisible(prev => !prev)}
          aria-label="Autoscroll settings"
          className={`inline-flex items-center justify-center w-14 h-14 rounded-full bg-panel
                     outline outline-dashed outline-1 [outline-offset:-8px] transition-colors
                     ${isSpeedPanelVisible
                       ? "outline-foreground/50 text-foreground/80"
                       : "outline-edge-bright text-foreground/50 hover:outline-foreground/50 hover:text-foreground/80 active:outline-foreground/50 active:text-foreground/80"
                     }`}
        >
          <FiSettings size={20} />
        </button>
      </div>

      {isSpeedPanelVisible && (
        <div className="fixed inset-0 z-30" onClick={() => setIsSpeedPanelVisible(false)} />
      )}
      {isSpeedPanelVisible && (
        <div role="dialog" aria-modal="true" aria-label="Autoscroll speed" className="fixed bottom-24 left-1/2 -translate-x-1/2 z-40 w-full max-w-sm px-4" onClick={event => event.stopPropagation()}>
          <div className="rounded-card-outer bg-panel p-2">
            <div className="rounded-2xl border border-dashed border-edge-bright px-5 py-4">
              <div className="flex items-center justify-between mb-4">
                <p className="text-sm font-bold text-foreground/85">Autoscroll Speed</p>
                <button
                  onClick={() => setIsSpeedPanelVisible(false)}
                  aria-label="Close settings"
                  className="text-foreground/60 hover:text-foreground transition-colors"
                >
                  <FiX size={16} />
                </button>
              </div>
              <input
                type="range"
                min={40} max={600} step={40}
                value={autoScrollSpeed}
                onChange={event => setAutoScrollSpeed(Number(event.target.value))}
                onPointerUp={event => lsSet(KEYS.autoScrollSpeed, (event.target as HTMLInputElement).value)}
                className="range-dashed"
              />
              <div className="flex justify-between mt-2 text-xs font-data text-foreground/50">
                <span>Slow</span>
                <span className="text-foreground/90 font-semibold">{autoScrollSpeed} px/s</span>
                <span>Fast</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {isChapterPanelVisible && (
        <div className="fixed inset-0 z-30 bg-black/40 backdrop-blur-sm" onClick={() => setIsChapterPanelVisible(false)} />
      )}
      {isChapterPanelVisible && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Chapter list"
          className="fixed bottom-24 left-1/2 -translate-x-1/2 z-40 w-full max-w-lg px-4"
          onClick={event => event.stopPropagation()}
        >
          <div className="rounded-card-outer bg-panel p-2 flex flex-col" style={{ maxHeight: "55vh" }}>
            <div className="rounded-2xl border border-dashed border-edge-bright flex flex-col overflow-hidden">

              <div className="flex items-center justify-between px-5 py-3 shrink-0">
                <p className="text-sm font-bold text-foreground/85">Search Chapter</p>
                <button
                  onClick={() => setIsChapterPanelVisible(false)}
                  aria-label="Close chapter list"
                  className="text-foreground/60 hover:text-foreground transition-colors"
                >
                  <FiX size={16} />
                </button>
              </div>

              <div className="flex items-center gap-2.5 mx-3 mb-3 px-4 py-2.5 rounded-full border border-dashed border-edge-bright bg-panel transition-colors focus-within:border-foreground/70 shrink-0">
                <FiSearch size={14} className="text-foreground/30 shrink-0" />
                <input
                  type="text"
                  placeholder="Search"
                  value={chapterSearch}
                  onChange={event => setChapterSearch(event.target.value)}
                  className="flex-1 min-w-0 bg-transparent text-[16px] sm:text-xs text-foreground/80 placeholder:text-foreground/30 outline-none"
                />
                <button
                  onClick={() => setIsChapterSortDesc(prev => !prev)}
                  aria-label="Toggle sort order"
                  className="text-foreground/40 hover:text-foreground/70 transition-colors shrink-0"
                >
                  {isChapterSortDesc ? <FiChevronDown size={15} /> : <FiChevronUp size={15} />}
                </button>
              </div>

              <div className="overflow-y-auto px-3 pb-3 space-y-1.5">
                {filteredChapters.length === 0 && chaptersLoading && (
                  <div className="flex items-center justify-center gap-1 py-8 text-xs font-semibold text-foreground/40 tracking-wider">
                    <span>Loading chapters</span>
                    <span className="inline-flex">
                      <span className="dot-blink" style={{ animationDelay: "0s" }}>.</span>
                      <span className="dot-blink" style={{ animationDelay: "0.2s" }}>.</span>
                      <span className="dot-blink" style={{ animationDelay: "0.4s" }}>.</span>
                    </span>
                  </div>
                )}
                {filteredChapters.length === 0 && !chaptersLoading && chaptersError && (
                  <div className="flex items-center justify-center py-8 text-xs text-foreground/40">
                    Could not load chapters
                  </div>
                )}
                {filteredChapters.map(chapter => (
                  <button
                    key={chapter.id}
                    onClick={() => {
                      if (base) navigate(`${base}/${encodeURIComponent(chapter.id)}`, {
                        state: { ...(titleName ? { title: titleName } : {}), ...(backPath ? { _back: backPath } : {}) }
                      });
                      setIsChapterPanelVisible(false);
                    }}
                    className={`w-full text-left px-4 py-2.5 rounded-full text-sm font-bold transition-colors border border-dashed ${
                      chapter.id === currentChapterId
                        ? "border-foreground/70 text-foreground/90"
                        : "border-edge-bright text-foreground/40 hover:border-foreground/40 hover:text-foreground/70"
                    }`}
                  >
                    <span>Chapter {chapter.number}</span>
                    {chapter.chapterUpdatedAt && (
                      <span className="ml-2 font-normal text-foreground/40 text-xs">{formatDate(chapter.chapterUpdatedAt)}</span>
                    )}
                  </button>
                ))}
              </div>

            </div>
          </div>
        </div>
      )}

      <div className={`fixed bottom-20 right-4 z-30 flex flex-col items-center gap-2
                        transition-opacity duration-300 ${uiVisible && !(isSpeedPanelVisible || isChapterPanelVisible) ? "opacity-100" : "opacity-0 pointer-events-none"}`}>
        <button
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          aria-label="Back to top"
          className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-panel
                     outline outline-dashed outline-1 outline-edge-bright [outline-offset:-8px] text-foreground/50
                     hover:outline-foreground/50 hover:text-foreground/80
                     active:outline-foreground/50 active:text-foreground/80 transition-colors"
        >
          <FiChevronUp size={20} />
        </button>

        <button
          onClick={() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "smooth" })}
          aria-label="Scroll to bottom"
          className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-panel
                     outline outline-dashed outline-1 outline-edge-bright [outline-offset:-8px] text-foreground/50
                     hover:outline-foreground/50 hover:text-foreground/80
                     active:outline-foreground/50 active:text-foreground/80 transition-colors"
        >
          <FiChevronDown size={20} />
        </button>
      </div>

    </>
  );
}
