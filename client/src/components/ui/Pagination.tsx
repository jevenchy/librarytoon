import { useEffect, useState } from "react";
import { FiChevronLeft, FiChevronRight } from "react-icons/fi";
import { pageNumbers } from "../../lib/pagination.js";

type Props = {
  page: number;
  totalPages: number;
  onPage: (pageNum: number) => void;
  className?: string;
};

const btnBase = "inline-flex items-center justify-center shrink-0 w-10 h-10 rounded-full bg-panel " +
  "outline outline-dashed outline-2 outline-edge-bright [outline-offset:-5px] transition-colors";

export default function Pagination({ page, totalPages, onPage, className }: Props) {
  if (totalPages <= 1) return null;

  const [isCompact, setIsCompact] = useState(() => window.matchMedia("(max-width: 639px)").matches);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)");
    const handler = (event: MediaQueryListEvent) => setIsCompact(event.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  const go = (pageNum: number) => { onPage(pageNum); window.scrollTo({ top: 0, behavior: "smooth" }); };

  return (
    <div className={`flex items-center justify-center gap-1.5 mt-8 sm:mt-12 ${className ?? ""}`}>
      <button
        onClick={() => go(Math.max(1, page - 1))}
        disabled={page === 1}
        className={`${btnBase} text-foreground/50
                   hover:outline-foreground/50 hover:text-foreground/80
                   active:outline-foreground/50 active:text-foreground/80
                   disabled:text-foreground/15 disabled:pointer-events-none disabled:select-none`}
      >
        <FiChevronLeft size={20} />
      </button>

      {pageNumbers(page, totalPages, isCompact).map((pageNum, idx) =>
        pageNum === "..." ? (
          <span key={`e-${idx}`} className="inline-flex items-center justify-center shrink-0 w-10 h-10 text-xs text-foreground/40">
            ...
          </span>
        ) : (
          <button
            key={pageNum}
            onClick={() => go(pageNum)}
            className={`${btnBase} text-sm font-semibold ${
              page === pageNum
                ? "outline-foreground/60 text-foreground/80"
                : "outline-edge-bright text-foreground/50 hover:outline-foreground/60 hover:text-foreground/80 active:outline-foreground/60 active:text-foreground/80"
            }`}
          >
            {pageNum}
          </button>
        )
      )}

      <button
        onClick={() => go(Math.min(totalPages, page + 1))}
        disabled={page === totalPages}
        className={`${btnBase} text-foreground/50
                   hover:outline-foreground/50 hover:text-foreground/80
                   active:outline-foreground/50 active:text-foreground/80
                   disabled:text-foreground/15 disabled:pointer-events-none disabled:select-none`}
      >
        <FiChevronRight size={20} />
      </button>
    </div>
  );
}
