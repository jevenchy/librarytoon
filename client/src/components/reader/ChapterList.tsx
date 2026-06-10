import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { FiChevronUp, FiChevronDown, FiSearch, FiEye } from "react-icons/fi";
import type { Chapter } from "../../../../shared/types.js";
import { KEYS, lsSet, lsGet } from "../../lib/storageKeys.js";
import { formatDate } from "../../lib/dateUtils.js";
import Pagination from "../ui/Pagination.js";

type Props = {
  chapters:     Chapter[];
  sourceId:     string;
  titleId:      string;
  titleName?:   string;
  backPath?:    string;
  description?: string;
};

function getReadChapters(sourceId: string, titleId: string): Set<string> {
  try {
    const raw = lsGet(KEYS.readChapters(sourceId, titleId));
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

function markChapterRead(sourceId: string, titleId: string, chapterId: string) {
  try {
    const key = KEYS.readChapters(sourceId, titleId);
    const raw = lsGet(key);
    const arr: string[] = raw ? JSON.parse(raw) : [];
    if (!arr.includes(chapterId)) {
      lsSet(key, JSON.stringify([...arr, chapterId].slice(-200)));
    }
  } catch {}
}

export default function ChapterList({ chapters, sourceId, titleId, titleName, backPath, description }: Props) {

  const [activeView, setActiveView] = useState<"chapters" | "description">("chapters");
  const [isSynopsisExpanded, setIsSynopsisExpanded] = useState(false);
  const [isSortAsc, setIsSortAsc]   = useState(false);
  const [search, setSearch]     = useState("");
  const [page, setPage]         = useState(1);
  const [lastRead, setLastRead] = useState<string | null>(
    () => lsGet(KEYS.lastRead(sourceId, titleId))
  );
  const [readChapters, setReadChapters] = useState<Set<string>>(
    () => getReadChapters(sourceId, titleId)
  );

  const sorted = useMemo(() => {
    const trimmedSearch = search.trim().toLowerCase();
    const filtered = trimmedSearch
      ? chapters.filter(chapter =>
          String(chapter.number).includes(trimmedSearch) || chapter.title.toLowerCase().includes(trimmedSearch))
      : chapters;
    return [...filtered].sort((chap1, chap2) => isSortAsc ? chap1.number - chap2.number : chap2.number - chap1.number);
  }, [chapters, isSortAsc, search]);

  const [pageSize, setPageSize] = useState(() =>
    window.matchMedia("(min-width: 1024px)").matches ? 30 : 14
  );

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const handler = (event: MediaQueryListEvent) => setPageSize(event.matches ? 30 : 14);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  const totalPages = Math.ceil(sorted.length / pageSize);
  const paginated  = sorted.slice((page - 1) * pageSize, page * pageSize);

  useEffect(() => { setPage(1); }, [search, isSortAsc, pageSize]);

  const handleNavigate = (chapterId: string) => {
    lsSet(KEYS.lastRead(sourceId, titleId), chapterId);
    markChapterRead(sourceId, titleId, chapterId);
    setLastRead(chapterId);
    setReadChapters(prev => new Set([...prev, chapterId]));
  };

  return (
    <div className="flex flex-col gap-4 animate-in fade-in-0 slide-in-from-bottom-4 duration-500">
      <div className="flex gap-4 border-b-2 border-dashed border-edge">
        {(["chapters", "description"] as const).map(view => (
          <button
            key={view}
            onClick={() => setActiveView(view)}
            className={activeView === view ? "filter-tab-active" : "filter-tab-inactive"}
          >
            {view === "chapters" ? "Chapters" : "Description"}
          </button>
        ))}
      </div>

      {activeView === "description" && (
        <div className="rounded-card-outer bg-panel p-2 transition-colors">
          <div className="rounded-card-inner border-2 border-dashed border-edge-bright p-4">
            {description ? (
              <>
                <p className="text-sm text-foreground/65 leading-relaxed">
                  {isSynopsisExpanded || description.length <= 1200
                    ? description
                    : description.slice(0, 1200) + "..."}
                </p>
                {description.length > 1200 && (
                  <button
                    onClick={() => setIsSynopsisExpanded(prev => !prev)}
                    className="mt-2 self-start text-xs text-foreground/50 hover:text-foreground/70 transition-colors"
                  >
                    {isSynopsisExpanded ? "Show less" : "Show more"}
                  </button>
                )}
              </>
            ) : (
              <p className="text-xs text-foreground/40">No description available</p>
            )}
          </div>
        </div>
      )}

      {activeView === "chapters" && (
        <>
          <div className="flex items-center gap-2.5 rounded-full border-2 border-dashed border-edge-bright bg-panel px-4 py-2.5 transition-colors focus-within:border-foreground/70">
            <FiSearch size={14} className="text-foreground/30 shrink-0" />
            <input
              type="text"
              placeholder="Search chapter number or title"
              value={search}
              onChange={event => setSearch(event.target.value)}
              className="flex-1 bg-transparent text-base sm:text-sm text-foreground/80
                         placeholder:text-foreground/40 outline-none"
              aria-label="Search chapter number or title"
            />
            <button
              onClick={() => setIsSortAsc(prev => !prev)}
              aria-label={isSortAsc ? "Sort newest first" : "Sort oldest first"}
              className="text-foreground/40 hover:text-foreground/70 transition-colors shrink-0"
            >
              {isSortAsc ? <FiChevronUp size={14} /> : <FiChevronDown size={14} />}
            </button>
          </div>

          <div className="rounded-card-outer bg-panel p-2 transition-colors">
            <div className="rounded-card-inner border-2 border-dashed border-edge-bright p-4">
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                {paginated.map(chapter => {
                  const isLastRead = lastRead === chapter.id;
                  const isRead     = !isLastRead && readChapters.has(chapter.id);
                  return (
                    <Link
                      key={chapter.id}
                      to={`/read/${sourceId}/${encodeURIComponent(titleId)}/${encodeURIComponent(chapter.id)}`}
                      state={{ ...(titleName ? { title: titleName } : {}), ...(backPath ? { _back: backPath } : {}) }}
                      onClick={() => handleNavigate(chapter.id)}
                      className="rounded-card-chapter border-2 border-dashed border-edge-bright p-3 flex flex-col gap-1.5 transition-colors hover:bg-foreground/[0.04] active:bg-foreground/[0.04]"
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span className={`text-sm font-semibold leading-tight ${
                          isLastRead ? "text-foreground/85" : isRead ? "text-foreground/40" : "text-foreground/65"
                        }`}>
                          Chapter {chapter.number}
                        </span>
                        {isLastRead ? (
                          <div className="w-1.5 h-1.5 rounded-full bg-foreground/60 shrink-0" />
                        ) : isRead ? (
                          <FiEye size={14} className="text-foreground/30 shrink-0" />
                        ) : null}
                      </div>
                      <span className="text-xs text-foreground/60 leading-none">
                        {formatDate(chapter.chapterUpdatedAt)}
                      </span>
                    </Link>
                  );
                })}
              </div>
            </div>
          </div>

          <Pagination page={page} totalPages={totalPages} onPage={setPage} className="mt-4 sm:mt-6" />
        </>
      )}
    </div>
  );
}
