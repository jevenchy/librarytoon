import { useEffect } from "react";
import { Link } from "react-router-dom";
import { FiChevronLeft } from "react-icons/fi";
import EmptyState from "../components/ui/EmptyState.js";

export default function NotFound() {
  useEffect(() => {
    document.title = "404 - Librarytoon";
    return () => { document.title = "Librarytoon"; };
  }, []);

  return (
    <div className="min-h-[100dvh] bg-bg flex items-center justify-center p-6 select-none">
      <EmptyState
        icon={<span className="text-6xl font-bold">404</span>}
        message="Page not found"
        action={
          <Link
            to="/"
            className="mt-1 inline-flex items-center gap-1.5 text-xs text-foreground/40 hover:text-foreground/80 transition-colors"
          >
            <FiChevronLeft size={14} />
            Back
          </Link>
        }
      />
    </div>
  );
}
