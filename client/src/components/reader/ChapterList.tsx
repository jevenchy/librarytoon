import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { FiBookOpen, FiArrowUp, FiArrowDown, FiSearch, FiEye, FiChevronLeft, FiChevronRight } from "react-icons/fi";
import type { Chapter } from "../../../../shared/types.js";
import MicroLabel from "../ui/MicroLabel.js";
import { KEYS } from "../../lib/storageKeys.js";

type Props = {
  chapters:  Chapter[];
  sourceId:  string;
  titleId:   string;
  titleName?: string;
  backPath?:  string;
};

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const hours  = Math.floor(diff / 3_600_000);
  const days   = Math.floor(diff / 86_400_000);
  if (hours < 1)  return "just now";
  if (hours < 24) return `${hours}h ago`;
  if (days  < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return months < 12 ? `${months}mo ago` : `${Math.floor(months / 12)}y ago`;
}


function getReadChapters(sourceId: string, titleId: string): Set<string> {
  try {
    const raw = localStorage.getItem(KEYS.readChapters(sourceId, titleId));
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

function markChapterRead(sourceId: string, titleId: string, chapterId: string) {
  try {
    const key = KEYS.readChapters(sourceId, titleId);
    const raw = localStorage.getItem(key);
    const arr: string[] = raw ? JSON.parse(raw) : [];
    if (!arr.includes(chapterId)) {
      localStorage.setItem(key, JSON.stringify([...arr, chapterId].slice(-200)));
    }
  } catch {}
}

export default function ChapterList({ chapters, sourceId, titleId, titleName, backPath }: Props) {
  const navigate = useNavigate();

  const [start, setStart]     = useState("");
  const [end, setEnd]         = useState("");
  const [sortAsc, setSortAsc] = useState(false);
  const [search, setSearch]   = useState("");
  const [page, setPage]       = useState(1);
  const [lastRead, setLastRead] = useState<string | null>(
    () => { try { return localStorage.getItem(KEYS.lastRead(sourceId, titleId)); } catch { return null; } }
  );
  const [readChapters, setReadChapters] = useState<Set<string>>(
    () => getReadChapters(sourceId, titleId)
  );

  const minCh = chapters.length > 0 ? Math.min(...chapters.map(c => c.number)) : null;
  const maxCh = chapters.length > 0 ? Math.max(...chapters.map(c => c.number)) : null;

  const sorted = useMemo(() => {
    const q = search.trim();
    const filtered = q
      ? chapters.filter(c => String(c.number).includes(q))
      : chapters;
    return [...filtered].sort((a, b) => sortAsc ? a.number - b.number : b.number - a.number);
  }, [chapters, sortAsc, search]);

  const [pageSize, setPageSize] = useState(() =>
    window.matchMedia("(min-width: 1024px)").matches ? 25 : 20
  );

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const handler = (e: MediaQueryListEvent) => setPageSize(e.matches ? 25 : 20);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  const totalPages = Math.ceil(sorted.length / pageSize);
  const paginated  = sorted.slice((page - 1) * pageSize, page * pageSize);

  useEffect(() => { setPage(1); }, [search, sortAsc, pageSize]);

  function pageNumbers(current: number, total: number): (number | "...")[] {
    if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
    if (current <= 4) return [1, 2, 3, 4, 5, "...", total];
    if (current >= total - 3) return [1, "...", total - 4, total - 3, total - 2, total - 1, total];
    return [1, "...", current - 1, current, current + 1, "...", total];
  }

  const handleNavigate = (chapterId: string) => {
    try { localStorage.setItem(KEYS.lastRead(sourceId, titleId), chapterId); } catch {}
    markChapterRead(sourceId, titleId, chapterId);
    setLastRead(chapterId);
    setReadChapters(prev => new Set([...prev, chapterId]));
  };

  const startRange = () => {
    const s = Number(start);
    const e = Number(end);
    if (!Number.isFinite(s) || !Number.isFinite(e) || s > e) return;
    navigate(`/range/${sourceId}/${encodeURIComponent(titleId)}/${s}/${e}`);
  };

  return (
    <div className="flex flex-col gap-4 animate-in fade-in-0 slide-in-from-bottom-4 duration-500">
      <div className="rounded-3xl bg-panel p-2">
        <div className="flex flex-col gap-3 rounded-2xl border border-dashed border-edge-bright p-5">

          <div className="mb-1">
            <span className="text-sm font-bold text-foreground/85">Read a chapter range</span>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
            <div className="flex items-center gap-2 flex-1">
            <input
              className="w-full bg-bg border border-dashed border-edge-bright rounded-full px-3 py-1.5
                         text-[16px] sm:text-xs font-data text-foreground/80
                         placeholder:text-foreground/30
                         outline-none focus:border-foreground/70 transition-colors"
              inputMode="decimal"
              placeholder="From"
              value={start}
              onChange={e => setStart(e.target.value)}
              aria-label="Range start chapter"
            />
            <span className="text-foreground/40 text-xs shrink-0">to</span>
            <input
              className="w-full bg-bg border border-dashed border-edge-bright rounded-full px-3 py-1.5
                         text-[16px] sm:text-xs font-data text-foreground/80
                         placeholder:text-foreground/30
                         outline-none focus:border-foreground/70 transition-colors"
              inputMode="decimal"
              placeholder="To"
              value={end}
              onChange={e => setEnd(e.target.value)}
              aria-label="Range end chapter"
            />
            <button
              onClick={startRange}
              disabled={!start || !end}
              className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full
                         bg-foreground text-background text-xs font-semibold
                         hover:opacity-90 active:opacity-90
                         disabled:opacity-30 transition-opacity"
            >
              <FiBookOpen size={14} />
              Go
            </button>
            </div>
          </div>

        </div>
      </div>

      <div className="flex items-center gap-2">
        <div className="flex-1 flex items-center gap-2.5 rounded-full border border-dashed border-edge-bright bg-panel px-4 py-2.5 transition-colors focus-within:border-foreground/70">
          <FiSearch size={14} className="text-foreground/30 shrink-0" />
          <input
            type="text"
            inputMode="decimal"
            placeholder="Search chapter number"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="flex-1 bg-transparent text-[16px] sm:text-xs text-foreground/80
                       placeholder:text-foreground/30 outline-none"
            aria-label="Search chapter number"
          />
        </div>
        <button
          onClick={() => setSortAsc(v => !v)}
          className="w-11 h-11 sm:w-9 sm:h-9 flex items-center justify-center rounded-full shrink-0
                     bg-panel border border-dashed border-edge-bright text-foreground/40
                     hover:border-foreground/70 hover:text-foreground/60
                     active:border-foreground/70 active:text-foreground/60
                     focus:outline-none transition-colors"
          aria-label={sortAsc ? "Sort oldest first" : "Sort newest first"}
        >
          {sortAsc ? <FiArrowUp size={14} /> : <FiArrowDown size={14} />}
        </button>
      </div>

      <div className="rounded-3xl bg-panel p-2">
        <div className="rounded-2xl border border-dashed border-edge-bright p-4">
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            {paginated.map(c => {
              const isLastRead = lastRead === c.id;
              const isRead     = !isLastRead && readChapters.has(c.id);
              return (
                <Link
                  key={c.id}
                  to={`/read/${sourceId}/${encodeURIComponent(titleId)}/${encodeURIComponent(c.id)}`}
                  state={{ ...(titleName ? { title: titleName } : {}), ...(backPath ? { _back: backPath } : {}) }}
                  onClick={() => handleNavigate(c.id)}
                  className="rounded-xl border border-dashed border-edge-bright p-4 flex flex-col gap-1.5 transition-colors hover:bg-foreground/[0.04] active:bg-foreground/[0.04]"
                >
                  <div className="flex items-center justify-between gap-1">
                    <span className={`text-xs font-semibold leading-tight ${
                      isLastRead ? "text-foreground/85" : isRead ? "text-foreground/40" : "text-foreground/65"
                    }`}>
                      Chapter {c.number}
                    </span>
                    {isLastRead ? (
                      <div className="w-1.5 h-1.5 rounded-full bg-foreground/60 shrink-0" />
                    ) : isRead ? (
                      <FiEye size={10} className="text-foreground/30 shrink-0" />
                    ) : null}
                  </div>
                  <span className="text-xs text-foreground/30 leading-none">
                    {c.chapterUpdatedAt ? relativeTime(c.chapterUpdatedAt) : "-"}
                  </span>
                </Link>
              );
            })}
          </div>
        </div>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-1.5">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
            className="w-8 h-8 flex items-center justify-center rounded-full
                       border border-dashed border-edge-bright text-foreground/40
                       hover:border-foreground/50 hover:text-foreground/60
                       disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <FiChevronLeft size={12} />
          </button>

          {pageNumbers(page, totalPages).map((n, i) =>
            n === "..." ? (
              <span key={`ellipsis-${i}`} className="w-8 h-8 flex items-center justify-center text-xs text-foreground/30">
                ...
              </span>
            ) : (
              <button
                key={n}
                onClick={() => setPage(n)}
                className={`w-8 h-8 flex items-center justify-center rounded-full text-xs transition-colors
                  border border-dashed
                  ${page === n
                    ? "border-foreground/40 text-foreground/80 font-semibold"
                    : "border-edge-bright text-foreground/40 hover:border-foreground/50 hover:text-foreground/60"
                  }`}
              >
                {n}
              </button>
            )
          )}

          <button
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="w-8 h-8 flex items-center justify-center rounded-full
                       border border-dashed border-edge-bright text-foreground/40
                       hover:border-foreground/50 hover:text-foreground/60
                       disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <FiChevronRight size={12} />
          </button>
        </div>
      )}
    </div>
  );
}
