import { useEffect, useRef, useState } from "react";
import { useParams, useLocation, Link } from "react-router-dom";
import { FiChevronLeft, FiX } from "react-icons/fi";
import type { Chapter, Page } from "../../../shared/types.js";
import { API } from "../lib/api.js";
import { KEYS, lsSet, lsGet } from "../lib/storageKeys.js";
import ReaderView from "../components/reader/Reader.js";
import EmptyState from "../components/ui/EmptyState.js";
import ErrorMessage from "../components/ui/ErrorMessage.js";
import { decodeHtml } from "../lib/htmlUtils.js";
import { useUiStore } from "../store/ui.js";

type State = {
  pages:   Page[];
  loading: boolean;
  error:   string | null;
};

const INITIAL_STATE: State = { pages: [], loading: true, error: null };

export default function Reader() {
  const params              = useParams();
  const { state: routerState } = useLocation();

  const sourceId   = params.sourceId ?? "";
  const titleId    = decodeURIComponent(params.titleId ?? "");
  const chapterId  = params.chapterId ? decodeURIComponent(params.chapterId) : null;

  const rawTitleName: string = (routerState as Record<string, unknown>)?.title as string
    ?? titleId.replace(/-/g, " ").replace(/\b\w/g, (char: string) => char.toUpperCase());

  // Decode HTML entities in the title (may come from scraper output)
  const decodedTitleName = decodeHtml(rawTitleName);
  const backPath: string | undefined = (routerState as Record<string, unknown>)?._back as string | undefined;

  useEffect(() => {
    document.title = `${decodedTitleName} - Librarytoon`;
    return () => { document.title = "Librarytoon"; };
  }, [decodedTitleName]);

  const [state, setState]               = useState<State>(INITIAL_STATE);
  const [chapters, setChapters]         = useState<Chapter[]>([]);
  const [chaptersLoading, setChaptersLoading] = useState(true);
  const [chaptersError, setChaptersError] = useState(false);
  const [savedScroll, setSavedScroll]   = useState<number | null>(null);
  const [isSlowSource, setIsSlowSource]     = useState(false);
  const uiVisible        = useUiStore(state => state.readerUiVisible);
  const setUiVisible     = useUiStore(state => state.setReaderUiVisible);

  useEffect(() => {
    setUiVisible(true);
    let lastScrollY = window.scrollY;
    // Hide chrome only on a deliberate downward scroll, not on small jitters or upward scrolls.
    const onScroll = () => {
      const currentY = window.scrollY;
      if (currentY - lastScrollY > 12) setUiVisible(false);
      lastScrollY = currentY;
    };
    const onContainerClick = (event: MouseEvent) => {
      // Only toggle when the click lands inside the reader page area, not on chrome/modals/buttons.
      const target = event.target as HTMLElement;
      if (target.closest(".reader-container")) {
        setUiVisible(!useUiStore.getState().readerUiVisible);
      }
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("click",  onContainerClick);
    return () => {
      setUiVisible(true);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("click",  onContainerClick);
    };
  }, []);

  useEffect(() => {
    if (!chapterId) return;
    let isCancelled = false;
    const pagesController = new AbortController();
    const chaptersController = new AbortController();
    setState(INITIAL_STATE);
    setIsSlowSource(false);

    setChaptersLoading(true);
    setChaptersError(false);
    API.chapters(sourceId, titleId, chaptersController.signal)
      .then(chaptersResult => { if (!isCancelled) setChapters(chaptersResult.chapters); })
      .catch(() => { if (!isCancelled) setChaptersError(true); })
      .finally(() => { if (!isCancelled) setChaptersLoading(false); });

    // After 20 s without a response, show a soft warning but keep waiting.
    const slowTimer = setTimeout(() => {
      if (!isCancelled) setIsSlowSource(true);
    }, 20_000);

    // After 90 s, give up and show an error.
    const hardTimer = setTimeout(() => {
      isCancelled = true;
      pagesController.abort();
      setState({ loading: false, pages: [], error: "timeout: source did not respond in time" });
    }, 90_000);

    API.pages(sourceId, chapterId, pagesController.signal)
      .then(pages => {
        if (isCancelled) return;
        setState({ pages, loading: false, error: null });
      })
      .catch(err => {
        if (!isCancelled) setState({ ...INITIAL_STATE, loading: false, error: String(err) });
      })
      .finally(() => { clearTimeout(slowTimer); clearTimeout(hardTimer); });

    return () => {
      isCancelled = true;
      pagesController.abort();
      chaptersController.abort();
      clearTimeout(slowTimer);
      clearTimeout(hardTimer);
    };
  }, [sourceId, titleId, chapterId]);

  useEffect(() => {
    if (!chapterId) return;
    const key = KEYS.scroll(sourceId, titleId, chapterId);
    const pageKey = KEYS.scrollPage(sourceId, titleId, chapterId);

    const savedPageIdx = Number(lsGet(pageKey) ?? "-1");
    const savedOffset  = Number(lsGet(key) ?? "0");
    if (savedPageIdx >= 0) setSavedScroll(savedOffset);

    const save = () => {
      if (window.scrollY <= 200) return;
      const scope = document.querySelector<HTMLElement>(".reader-container");
      if (!scope) return;
      let bestMatch: HTMLElement | null = null;
      let bestArea = 0;
      scope.querySelectorAll<HTMLElement>("[data-index]").forEach(el => {
        const rect = el.getBoundingClientRect();
        const vis = Math.min(rect.bottom, window.innerHeight) - Math.max(rect.top, 0);
        if (vis > bestArea) { bestArea = vis; bestMatch = el; }
      });
      const bestEl = bestMatch as HTMLElement | null;
      if (bestEl) {
        const bestIdx = Number(bestEl.dataset.index ?? 0);
        // Only compute pixel offset when all images above have loaded - placeholder heights make offsetTop wrong otherwise.
        const allAboveLoaded = Array.from(scope.querySelectorAll<HTMLImageElement>("img"))
          .filter(img => {
            const pageDiv = img.closest<HTMLElement>("[data-index]");
            return pageDiv && Number(pageDiv.dataset.index ?? Infinity) < bestIdx;
          })
          .every(img => img.complete && img.naturalHeight > 0);
        const offsetInPage = allAboveLoaded
          ? Math.max(0, -bestEl.getBoundingClientRect().top)
          : 0;
        lsSet(key, String(offsetInPage));
        lsSet(pageKey, String(bestIdx));
      }
    };

    window.addEventListener("beforeunload", save);
    window.addEventListener("pagehide", save);
    return () => {
      save();
      window.removeEventListener("beforeunload", save);
      window.removeEventListener("pagehide", save);
    };
  }, [sourceId, titleId, chapterId]);

  useEffect(() => {
    if (savedScroll === null || state.loading) return;
    const scope = document.querySelector(".reader-container") ?? document;

    const savedPageIdx = chapterId
      ? Number(lsGet(KEYS.scrollPage(sourceId, titleId, chapterId)) ?? "-1")
      : -1;
    if (savedPageIdx < 0) { setSavedScroll(null); return; }

    const targetEl = document.querySelector<HTMLElement>(`[data-index="${savedPageIdx}"]`);
    if (targetEl) targetEl.scrollIntoView({ block: "start" });

    // Images above the target are lazy and do not load while above the viewport.
    // Promote them to eager so their real heights are ready when we apply exact scroll.
    scope.querySelectorAll<HTMLImageElement>("img").forEach(img => {
      if (img.complete) return;
      const pageDiv = img.closest<HTMLElement>("[data-index]");
      if (pageDiv && Number(pageDiv.dataset.index ?? Infinity) < savedPageIdx) {
        img.loading = "eager";
      }
    });

    // Wait for images up to and including the target page - their heights determine the final position.
    const imgs = Array.from(scope.querySelectorAll<HTMLImageElement>("img"));
    const pending = imgs.filter(img => {
      if (img.complete) return false;
      const pageDiv = img.closest<HTMLElement>("[data-index]");
      if (!pageDiv) return true;
      return Number(pageDiv.dataset.index ?? Infinity) <= savedPageIdx;
    });

    let done = false;
    let fallback: ReturnType<typeof setTimeout>;

    const applyExact = () => {
      // rAF ensures layout has settled after the final image load before reading offsetTop.
      requestAnimationFrame(() => {
        const el = document.querySelector<HTMLElement>(`[data-index="${savedPageIdx}"]`);
        if (el) window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY + (savedScroll ?? 0) });
        setSavedScroll(null);
      });
    };

    const applyApproximate = () => {
      // Fallback: images still loading, offsetTop unreliable - use scrollIntoView for the correct page.
      const el = document.querySelector<HTMLElement>(`[data-index="${savedPageIdx}"]`);
      if (el) el.scrollIntoView({ block: "start" });
      setSavedScroll(null);
    };

    const apply = (approximate = false) => {
      if (done) return;
      done = true;
      clearTimeout(fallback);
      if (approximate) applyApproximate(); else applyExact();
    };

    if (pending.length === 0) { apply(); return; }
    let settled = 0;
    const onSettle = () => { if (++settled >= pending.length) apply(); };
    fallback = setTimeout(() => apply(true), 6000);
    pending.forEach(img => {
      img.addEventListener("load", onSettle);
      img.addEventListener("error", onSettle);
    });
    return () => {
      clearTimeout(fallback);
      pending.forEach(img => {
        img.removeEventListener("load", onSettle);
        img.removeEventListener("error", onSettle);
      });
    };
  }, [savedScroll, state.loading]);

  const isSourceDown = state.error
    ? state.error.includes("timeout") || state.error.includes("unreachable")
    : false;

  const detailPath = `/detail/${sourceId}/${encodeURIComponent(titleId)}`;
  const backLink = (
    <Link
      to={detailPath}
      state={backPath ? { _back: backPath } : undefined}
      className="mt-1 inline-flex items-center gap-1.5 text-xs text-foreground/40 hover:text-foreground/80 transition-colors"
    >
      <FiChevronLeft size={14} />
      Back
    </Link>
  );

  if (isSourceDown) {
    return (
      <div className="min-h-[100dvh] bg-bg flex items-center justify-center p-6 select-none">
        <EmptyState icon={<FiX size={32} />} message="Source Unavailable" action={backLink} />
      </div>
    );
  }

  if (state.error) {
    return (
      <div className="min-h-[100dvh] bg-bg flex items-center justify-center p-6 select-none">
        <ErrorMessage message={state.error} action={backLink} />
      </div>
    );
  }

  if (!state.loading && state.pages.length === 0) {
    return (
      <div className="min-h-[100dvh] bg-bg flex items-center justify-center p-6 select-none">
        <EmptyState icon={<FiX size={32} />} message="No Pages Available" action={backLink} />
      </div>
    );
  }

  return (
    <div className="bg-bg">
      <div>
        {state.loading && (
          <div className="flex min-h-[60vh] flex-col items-center justify-center gap-2 text-xs font-semibold text-foreground/40 tracking-wider">
            <span className="flex items-center gap-1">
              Loading
              <span className="inline-flex">
                <span className="dot-blink" style={{ animationDelay: "0s" }}>.</span>
                <span className="dot-blink" style={{ animationDelay: "0.2s" }}>.</span>
                <span className="dot-blink" style={{ animationDelay: "0.4s" }}>.</span>
              </span>
            </span>
            {isSlowSource && (
              <span className="font-normal text-foreground/25">Source is taking longer than usual</span>
            )}
          </div>
        )}

        {!state.loading && (
          <ReaderView
            pages={state.pages}
            sourceId={sourceId}
            titleId={titleId}
            titleName={decodedTitleName}
            chapters={chapters}
            chaptersLoading={chaptersLoading}
            chaptersError={chaptersError}
            currentChapterId={chapterId ?? undefined}
            uiVisible={uiVisible}
            backPath={backPath}
          />
        )}
      </div>

    </div>
  );
}
