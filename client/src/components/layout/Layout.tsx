import { useRef, useState } from "react";
import { KEYS } from "../../lib/storageKeys.js";
import { Link, Outlet, useLocation } from "react-router-dom";
import { useUiStore } from "../../store/ui.js";
import { FiSettings, FiX, FiMenu, FiBookmark } from "react-icons/fi";

function SunIcon() {
  return (
    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="24" height="24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
        d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"/>
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="24" height="24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
        d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"/>
    </svg>
  );
}

export default function Layout() {
  const location = useLocation();
  const { pathname } = location;
  const [open, setOpen] = useState(false);

  const lastHomeSearch = useRef("");
  if (pathname === "/") lastHomeSearch.current = location.search;
  const isReader = pathname.startsWith("/read/") || pathname.startsWith("/range/");
  const [theme, setTheme] = useState<"dark" | "light">(() =>
    document.documentElement.classList.contains("dark") ? "dark" : "light"
  );

  const toggle = () => {
    const next = theme === "dark" ? "light" : "dark";
    document.documentElement.classList.remove("light", "dark");
    document.documentElement.classList.add(next);
    document.documentElement.style.colorScheme = next;
    try { localStorage.setItem(KEYS.theme, next); } catch {}
    setTheme(next);
  };

  const isActive = (p: string) => p === "/" ? pathname === "/" : pathname.startsWith(p);

  return (
    <div className="min-h-[100dvh] flex flex-col bg-bg">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:z-[100] focus:top-2 focus:left-2
                   focus:px-3 focus:py-2 focus:bg-panel focus:text-xs focus:text-foreground/80
                   focus:rounded-full focus:border focus:border-dashed focus:border-edge-bright"
      >
        Skip to content
      </a>

      {/* Desktop header */}
      <header className={`hidden lg:block sticky top-0 z-20 bg-bg transition-opacity duration-300 ${!isReader ? "opacity-100" : "opacity-0 pointer-events-none h-0 overflow-hidden"}`}>
        <div className="mx-auto max-w-content px-6 h-14 flex items-center justify-between">
          <Link
            to={`/${lastHomeSearch.current}`}
            className={`text-base font-semibold tracking-[0.2em] uppercase transition-colors select-none ${
              isActive("/") ? "text-foreground" : "text-foreground/60 hover:text-foreground active:text-foreground"
            }`}
          >
            LIBRARYTOON
          </Link>
          <div className="flex items-center gap-3">
            <Link
              to="/bookmarks"
              className={`transition-colors ${
                isActive("/bookmarks") ? "text-foreground" : "text-foreground/40 hover:text-foreground active:text-foreground"
              }`}
              aria-label="Bookmarks"
            >
              <FiBookmark size={22} />
            </Link>
            <Link
              to="/sources"
              className={`transition-colors ${
                isActive("/sources") ? "text-foreground" : "text-foreground/40 hover:text-foreground active:text-foreground"
              }`}
              aria-label="Sources"
            >
              <FiSettings size={22} />
            </Link>
            <button
              onClick={toggle}
              aria-label="Toggle theme"
              className="text-foreground/40 hover:text-foreground active:text-foreground transition-colors"
            >
              {theme === "dark" ? <SunIcon /> : <MoonIcon />}
            </button>
          </div>
        </div>
      </header>

      {/* Mobile header */}
      <header className={`lg:hidden fixed top-0 left-0 right-0 z-20 h-12 bg-bg px-4 flex items-center justify-between transition-opacity duration-300 ${!isReader ? "opacity-100" : "opacity-0 pointer-events-none"}`}>
        <button
          onClick={() => setOpen(true)}
          aria-label="Open menu"
          className="text-foreground/60 hover:text-foreground transition-colors"
        >
          <FiMenu size={28} />
        </button>
        <Link to={`/${lastHomeSearch.current}`}>
          <img src="/logo-white.png" alt="Librarytoon" className="h-8 hidden dark:block select-none" draggable={false} />
          <img src="/logo-black.png" alt="Librarytoon" className="h-8 block dark:hidden select-none" draggable={false} />
        </Link>
      </header>

      {/* Mobile sidebar overlay */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm lg:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Mobile sidebar */}
      <aside
        className={`fixed left-0 top-0 z-50 h-screen w-[70%] max-w-[280px] bg-bg border-r border-dashed border-edge
                    transition-transform duration-300 lg:hidden
                    ${open ? "translate-x-0" : "-translate-x-full"}`}
      >
        <div className="h-12 px-4 flex items-center justify-between">
          <button
            onClick={() => setOpen(false)}
            aria-label="Close menu"
            className="text-foreground/60 hover:text-foreground transition-colors"
          >
            <FiX size={24} />
          </button>
          <button
            onClick={toggle}
            aria-label="Toggle theme"
            className="w-7 h-7 flex items-center justify-center text-foreground/60 hover:opacity-70 transition-opacity"
          >
            {theme === "dark" ? <SunIcon /> : <MoonIcon />}
          </button>
        </div>
        <nav className="flex flex-col gap-6 px-6 pt-8">
          <Link
            to={`/${lastHomeSearch.current}`}
            onClick={() => setOpen(false)}
            className={`text-xl font-semibold uppercase transition-colors ${
              isActive("/")
                ? "underline decoration-[3px] underline-offset-4 text-foreground"
                : "text-foreground/60 hover:text-foreground"
            }`}
          >
            Home
          </Link>
          <Link
            to="/bookmarks"
            onClick={() => setOpen(false)}
            className={`text-xl font-semibold uppercase transition-colors ${
              isActive("/bookmarks")
                ? "underline decoration-[3px] underline-offset-4 text-foreground"
                : "text-foreground/60 hover:text-foreground"
            }`}
          >
            Bookmarks
          </Link>
          <Link
            to="/sources"
            onClick={() => setOpen(false)}
            className={`text-xl font-semibold uppercase transition-colors ${
              isActive("/sources")
                ? "underline decoration-[3px] underline-offset-4 text-foreground"
                : "text-foreground/60 hover:text-foreground"
            }`}
          >
            Sources
          </Link>
        </nav>
      </aside>

      <main id="main-content" className={`flex-1 relative lg:pt-0 ${!isReader ? "pt-12" : ""}`}>
        <Outlet />
      </main>
    </div>
  );
}
