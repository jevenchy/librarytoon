import { useEffect, useMemo, useRef, useState, memo } from "react";
import { Link } from "react-router-dom";
import { FiChevronLeft, FiChevronRight, FiChevronUp, FiChevronDown, FiList, FiHome } from "react-icons/fi";
import { KEYS } from "../../lib/storageKeys.js";
import type { Chapter, ChapterBoundary, Page } from "../../../../shared/types.js";
import { preloadImages, resetPreloadCache } from "../../lib/imagePreloader.js";

type Props = {
  pages:            Page[];
  boundaries?:      ChapterBoundary[];
  sourceId?:        string;
  titleId?:         string;
  titleName?:       string;
  chapters?:        Chapter[];
  currentChapterId?: string;
  uiVisible?:       boolean;
  backPath?:        string;
};

function decodeHtml(str: string): string {
  const txt = document.createElement("textarea");
  txt.innerHTML = str;
  return txt.value;
}

function SunIcon() {
  return (
    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="18" height="18">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
        d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"/>
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="18" height="18">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
        d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"/>
    </svg>
  );
}

// Single page image with loading state; memo prevents re-renders from parent scroll state
const ReaderImage = memo(function ReaderImage({
  src,
  index,
}: {
  src:   string;
  index: number;
}) {
  const [loaded, setLoaded] = useState(false);

  return (
    <div className="w-full relative bg-bg" style={{ minHeight: loaded ? undefined : 480 }}>
      {!loaded && (
        <div className="absolute inset-0 skeleton-shimmer" />
      )}
      <img
        src={src}
        alt=""
        loading={index < 3 ? "eager" : "lazy"}
        decoding="async"
        draggable={false}
        onLoad={() => setLoaded(true)}
        className={`block w-full h-auto select-none transition-opacity duration-300 ${
          loaded ? "opacity-100" : "opacity-0"
        }`}
        {...(index < 3 ? { fetchpriority: "high" } as Record<string, string> : {})}
      />
    </div>
  );
});

export default function Reader({
  pages,
  boundaries,
  sourceId,
  titleId,
  titleName,
  chapters,
  currentChapterId,
  uiVisible = true,
  backPath,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  const [theme, setTheme] = useState<"dark" | "light">(() =>
    document.documentElement.classList.contains("dark") ? "dark" : "light"
  );
  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    document.documentElement.classList.remove("light", "dark");
    document.documentElement.classList.add(next);
    document.documentElement.style.colorScheme = next;
    try { localStorage.setItem(KEYS.theme, next); } catch {}
    setTheme(next);
  };

  // Preload first batch and reset cache on new page set
  useEffect(() => {
    resetPreloadCache();
    preloadImages(pages.slice(0, 5).map(p => p.imageUrl));
  }, [pages]);

  // Intersection-based preload (aggressive, 1200px lookahead for binge reading)
  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      entries => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const idx = Number((entry.target as HTMLElement).dataset.index);
          preloadImages(pages.slice(idx + 1, idx + 5).map(p => p.imageUrl));
        }
      },
      { rootMargin: "1200px" }
    );
    node.querySelectorAll<HTMLElement>("[data-index]").forEach(el => observer.observe(el));
    return () => observer.disconnect();
  }, [pages]);

  // Prev/next chapter from sorted chapter list
  const { prevChapter, nextChapter } = useMemo(() => {
    if (!chapters?.length || !currentChapterId) return { prevChapter: null, nextChapter: null };
    const sorted = [...chapters].sort((a, b) => a.number - b.number);
    const idx = sorted.findIndex(c => c.id === currentChapterId);
    return {
      prevChapter: idx > 0 ? sorted[idx - 1] : null,
      nextChapter: idx !== -1 && idx < sorted.length - 1 ? sorted[idx + 1] : null,
    };
  }, [chapters, currentChapterId]);

  if (pages.length === 0) {
    return (
      <div className="flex items-center justify-center py-24 text-xs text-white/40">
        No pages available for this chapter.
      </div>
    );
  }

  const base      = sourceId && titleId ? `/read/${sourceId}/${encodeURIComponent(titleId)}` : null;
  const detailUrl = sourceId && titleId ? `/source/${sourceId}/${encodeURIComponent(titleId)}` : null;

  const currentChapter = useMemo(() => {
    if (!chapters?.length || !currentChapterId) return null;
    return chapters.find(c => c.id === currentChapterId) ?? null;
  }, [chapters, currentChapterId]);

  return (
    <>
      {/* Header: back + title */}
      <div
        className={`fixed top-0 left-0 right-0 z-20
                    transition-transform duration-300 ${uiVisible ? "translate-y-0" : "-translate-y-full"}`}
      >
        <div className="max-w-reader mx-auto px-4 sm:px-6 py-3">
          <div className="rounded-3xl bg-panel p-2">
            <div className="rounded-2xl border border-dashed border-edge-bright px-4 py-3">
              <div className="flex items-center gap-3">
                <Link
                  to={backPath ?? "/"}
                  aria-label="Home"
                  className="inline-flex items-center justify-center w-8 h-8 rounded-full shrink-0
                             border border-dashed border-edge-bright text-foreground/50
                             hover:border-foreground/50 hover:text-foreground/80
                             active:border-foreground/50 active:text-foreground/80 transition-colors"
                >
                  <FiHome size={13} />
                </Link>
                <div className="flex-1 min-w-0">
                  {titleName && (
                    <p className="text-sm font-bold text-foreground/85 truncate leading-tight">
                      {(() => { const d = decodeHtml(titleName); return (<><span className="sm:hidden">{d.length > 22 ? d.slice(0, 22) + "…" : d}</span><span className="hidden sm:inline">{d.length > 44 ? d.slice(0, 44) + "…" : d}</span></>); })()}
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
                  {theme === "dark" ? <SunIcon /> : <MoonIcon />}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Page images */}
      <div
        ref={containerRef}
        className="reader-container mx-auto w-full max-w-reader px-0"
      >
        {pages.map((p, i) => (
          <div key={`${p.chapterId}-${p.index}`} data-index={i}>
            <ReaderImage src={p.imageUrl} index={i} />
          </div>
        ))}
      </div>

      {/* Footer: prev/next navigation */}
      <div
        className={`fixed bottom-0 left-0 right-0 z-20
                    transition-transform duration-300 ${uiVisible ? "translate-y-0" : "translate-y-full"}`}
      >
        <div className="max-w-reader mx-auto px-4 sm:px-6 py-3 flex justify-center">
          <div className="flex items-center gap-3">
                {prevChapter && base ? (
                  <Link
                    to={`${base}/${encodeURIComponent(prevChapter.id)}`}
                    state={{ ...(titleName ? { title: titleName } : {}), ...(backPath ? { _back: backPath } : {}) }}
                    className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-panel
                               outline outline-dashed outline-1 outline-edge-bright [outline-offset:-8px] text-foreground/50
                               hover:outline-foreground/50 hover:text-foreground/80
                               active:outline-foreground/50 active:text-foreground/80 transition-colors dash-breathe"
                  >
                    <FiChevronLeft size={22} />
                  </Link>
                ) : (
                  <span className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-panel
                                   outline outline-dashed outline-1 outline-edge-bright [outline-offset:-8px] text-foreground/50
                                   opacity-30 pointer-events-none select-none">
                    <FiChevronLeft size={22} />
                  </span>
                )}

                {detailUrl && (
                  <Link
                    to={detailUrl}
                    state={backPath ? { _back: backPath } : undefined}
                    className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-panel
                               outline outline-dashed outline-1 outline-edge-bright [outline-offset:-8px] text-foreground/50
                               hover:outline-foreground/50 hover:text-foreground/80
                               active:outline-foreground/50 active:text-foreground/80 transition-colors dash-breathe"
                  >
                    <FiList size={22} />
                  </Link>
                )}

                {nextChapter && base ? (
                  <Link
                    to={`${base}/${encodeURIComponent(nextChapter.id)}`}
                    state={{ ...(titleName ? { title: titleName } : {}), ...(backPath ? { _back: backPath } : {}) }}
                    className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-panel
                               outline outline-dashed outline-1 outline-edge-bright [outline-offset:-8px] text-foreground/50
                               hover:outline-foreground/50 hover:text-foreground/80
                               active:outline-foreground/50 active:text-foreground/80 transition-colors dash-breathe"
                  >
                    <FiChevronRight size={22} />
                  </Link>
                ) : (
                  <span className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-panel
                                   outline outline-dashed outline-1 outline-edge-bright [outline-offset:-8px] text-foreground/50
                                   opacity-30 pointer-events-none select-none">
                    <FiChevronRight size={22} />
                  </span>
                )}
          </div>
        </div>
      </div>

      {/* Up / Down strip, bottom right */}
      <div className={`fixed bottom-20 right-4 z-30 flex flex-col items-center gap-2
                        transition-opacity duration-300 ${uiVisible ? "opacity-100" : "opacity-0 pointer-events-none"}`}>
        <button
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          aria-label="Back to top"
          className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-panel
                     outline outline-dashed outline-1 outline-edge-bright [outline-offset:-8px] text-foreground/50
                     hover:outline-foreground/50 hover:text-foreground/80
                     active:outline-foreground/50 active:text-foreground/80 transition-colors"
        >
          <FiChevronUp size={22} />
        </button>

        <button
          onClick={() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "smooth" })}
          aria-label="Scroll to bottom"
          className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-panel
                     outline outline-dashed outline-1 outline-edge-bright [outline-offset:-8px] text-foreground/50
                     hover:outline-foreground/50 hover:text-foreground/80
                     active:outline-foreground/50 active:text-foreground/80 transition-colors"
        >
          <FiChevronDown size={22} />
        </button>
      </div>

    </>
  );
}
