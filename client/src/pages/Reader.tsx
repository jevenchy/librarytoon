import { useEffect, useRef, useState } from "react";
import { useUiStore } from "../store/ui.js";
import { useParams, useLocation, Link } from "react-router-dom";
import { FiArrowLeft, FiX } from "react-icons/fi";
import type { Chapter, ChapterBoundary, Page } from "../../../shared/types.js";
import { api } from "../lib/api.js";
import { KEYS } from "../lib/storageKeys.js";
import Reader from "../components/reader/Reader.js";
import ErrorMessage from "../components/ui/ErrorMessage.js";
import EmptyState from "../components/ui/EmptyState.js";

type State = {
  pages:      Page[];
  boundaries: ChapterBoundary[];
  loading:    boolean;
  error:      string | null;
  partial:    boolean;
};

const initial: State = { pages: [], boundaries: [], loading: true, error: null, partial: false };


export default function ReaderPage() {
  const params              = useParams();
  const { state: routerState } = useLocation();

  const sourceId   = params.sourceId ?? "";
  const titleId    = decodeURIComponent(params.titleId ?? "");
  const chapterId  = params.chapterId ? decodeURIComponent(params.chapterId) : null;
  const rangeStart = params.start ? Number(params.start) : null;
  const rangeEnd   = params.end   ? Number(params.end)   : null;

  const rawTitleName: string = (routerState as Record<string, unknown>)?.title as string
    ?? titleId.replace(/-/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase());
  const backPath: string | undefined = (routerState as Record<string, unknown>)?._back as string | undefined;

  useEffect(() => {
    document.title = `${rawTitleName} - Librarytoon`;
    return () => { document.title = "Librarytoon"; };
  }, [rawTitleName]);

  const [state, setState]               = useState<State>(initial);
  const [chapters, setChapters]         = useState<Chapter[]>([]);
  const [savedScroll, setSavedScroll]   = useState<number | null>(null);
  const uiVisible        = useUiStore(s => s.readerUiVisible);
  const setUiVisible     = useUiStore(s => s.setReaderUiVisible);

  useEffect(() => {
    setUiVisible(true);
    const onScroll = () => setUiVisible(false);
    const onClick  = () => setUiVisible(!useUiStore.getState().readerUiVisible);
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("click",  onClick);
    return () => {
      setUiVisible(true);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("click",  onClick);
    };
  }, []);

  // Fetch pages
  useEffect(() => {
    let cancelled = false;
    setState(initial);

    api.chapters(sourceId, titleId)
      .then(data => { if (!cancelled) setChapters(data); })
      .catch(() => {});

    const run = async () => {
      try {
        if (chapterId) {
          const pages = await api.pages(sourceId, chapterId);
          if (cancelled) return;
          setState({
            pages,
            boundaries: [{ chapterId, chapterNumber: 0, chapterTitle: "", startIndex: 0, endIndex: pages.length - 1 }],
            loading: false, error: null, partial: pages.length === 0
          });
          return;
        }
        if (rangeStart !== null && rangeEnd !== null) {
          const result = await api.readRange(sourceId, titleId, rangeStart, rangeEnd);
          if (cancelled) return;
          setState({ pages: result.pages, boundaries: result.boundaries, loading: false, error: null, partial: result.failed.length > 0 });
        }
      } catch (err) {
        if (!cancelled) setState({ ...initial, loading: false, error: String(err) });
      }
    };
    run();
    return () => { cancelled = true; };
  }, [sourceId, titleId, chapterId, rangeStart, rangeEnd]);

  // Scroll save/restore; only for single-chapter reads
  useEffect(() => {
    if (!chapterId) return;
    const key = KEYS.scroll(sourceId, titleId, chapterId);

    const saved = Number(localStorage.getItem(key) ?? "0");
    if (saved > 200) setSavedScroll(saved);

    const save = () => {
      if (window.scrollY > 200)
        localStorage.setItem(key, String(Math.round(window.scrollY)));
    };

    window.addEventListener("beforeunload", save);
    window.addEventListener("pagehide", save);
    return () => {
      save(); // save on SPA navigation away
      window.removeEventListener("beforeunload", save);
      window.removeEventListener("pagehide", save);
    };
  }, [sourceId, titleId, chapterId]);

  // Auto-dismiss Resume toast after 5s
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (savedScroll === null || state.loading) return;
    toastTimerRef.current = setTimeout(() => setSavedScroll(null), 5000);
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, [savedScroll, state.loading]);

  const handleResume = () => {
    if (savedScroll !== null) window.scrollTo({ top: savedScroll, behavior: "smooth" });
    setSavedScroll(null);
  };

  const isSourceDown = state.error
    ? state.error.includes("timeout") || state.error.includes("unreachable")
    : false;

  if (isSourceDown) {
    return (
      <div className="min-h-[100dvh] bg-bg flex items-center justify-center p-6 select-none">
        <EmptyState
          icon={<FiX size={32} />}
          message="Source Unavailable"
          hint="This source is not responding. It may be temporarily down. Try again later."
          action={
            <Link
              to={backPath ?? "/"}
              className="mt-1 inline-flex items-center gap-1.5 text-xs text-foreground/40 hover:text-foreground/80 transition-colors"
            >
              <FiArrowLeft size={12} />
              Back
            </Link>
          }
        />
      </div>
    );
  }

  if (!state.loading && !state.error && state.pages.length === 0) {
    return (
      <div className="min-h-[100dvh] bg-bg flex items-center justify-center p-6 select-none">
        <EmptyState
          icon={<FiX size={32} />}
          message="No pages available for this chapter."
          action={
            <Link
              to={backPath ?? "/"}
              className="mt-1 inline-flex items-center gap-1.5 text-xs text-foreground/40 hover:text-foreground/80 transition-colors"
            >
              <FiArrowLeft size={12} />
              Back
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div className="bg-bg">
      <div>
        {state.partial && (
          <div className="mx-auto max-w-reader px-4 pt-3 pb-1 text-center">
            <span className="text-xs text-foreground/40">Some chapters in this range could not be loaded</span>
          </div>
        )}

        {state.loading && (
          <div className="flex min-h-[60vh] items-center justify-center gap-1 text-xs font-semibold text-foreground/40 tracking-wider">
            <span>Loading</span>
            <span className="inline-flex">
              <span className="dot-blink" style={{ animationDelay: "0s" }}>.</span>
              <span className="dot-blink" style={{ animationDelay: "0.2s" }}>.</span>
              <span className="dot-blink" style={{ animationDelay: "0.4s" }}>.</span>
            </span>
          </div>
        )}

        {state.error && (
          <div className="flex items-center justify-center pt-20 px-6">
            <div className="max-w-sm w-full">
              <ErrorMessage message={state.error} />
            </div>
          </div>
        )}

        {!state.loading && !state.error && (
          <Reader
            pages={state.pages}
            boundaries={state.boundaries}
            sourceId={sourceId}
            titleId={titleId}
            titleName={rawTitleName}
            chapters={chapters}
            currentChapterId={chapterId ?? undefined}
            uiVisible={uiVisible}
            backPath={backPath}
          />
        )}
      </div>

    </div>
  );
}
