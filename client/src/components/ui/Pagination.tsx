import { FiChevronLeft, FiChevronRight } from "react-icons/fi";
import { pageNumbers } from "../../lib/pagination.js";

interface Props {
  page: number;
  totalPages: number;
  onPage: (n: number) => void;
  className?: string;
}

export default function Pagination({ page, totalPages, onPage, className }: Props) {
  if (totalPages <= 1) return null;

  const go = (n: number) => { onPage(n); window.scrollTo({ top: 0, behavior: "smooth" }); };

  return (
    <div className={`flex items-center justify-center gap-1.5 mt-8 ${className ?? ""}`}>
      <button
        onClick={() => go(Math.max(1, page - 1))}
        disabled={page === 1}
        className="w-8 h-8 flex items-center justify-center rounded-full border border-dashed border-edge-bright text-foreground/40 hover:border-foreground/50 hover:text-foreground/60 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
      >
        <FiChevronLeft size={12} />
      </button>

      {pageNumbers(page, totalPages).map((n, i) =>
        n === "..." ? (
          <span key={`e-${i}`} className="w-8 h-8 flex items-center justify-center text-xs text-foreground/30">
            ...
          </span>
        ) : (
          <button
            key={n}
            onClick={() => go(n)}
            className={`w-8 h-8 flex items-center justify-center rounded-full text-xs transition-colors border border-dashed ${
              page === n
                ? "border-foreground/40 text-foreground/80 font-semibold"
                : "border-edge-bright text-foreground/40 hover:border-foreground/50 hover:text-foreground/60"
            }`}
          >
            {n}
          </button>
        )
      )}

      <button
        onClick={() => go(Math.min(totalPages, page + 1))}
        disabled={page === totalPages}
        className="w-8 h-8 flex items-center justify-center rounded-full border border-dashed border-edge-bright text-foreground/40 hover:border-foreground/50 hover:text-foreground/60 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
      >
        <FiChevronRight size={12} />
      </button>
    </div>
  );
}
