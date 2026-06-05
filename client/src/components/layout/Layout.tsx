import { useEffect, useRef, useState, useCallback } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";
import { FiSettings, FiX, FiMenu, FiBookmark } from "react-icons/fi";
import { KEYS, lsSet, getStoredTheme } from "../../lib/storageKeys.js";
import { SunIcon, MoonIcon } from "../ui/ThemeIcons.js";

export default function Layout() {
  const location    = useLocation();
  const { pathname } = location;
  const [isOpen, setIsOpen] = useState(false);
  const menuBtnRef  = useRef<HTMLButtonElement>(null);
  const navRef      = useRef<HTMLElement>(null);

  const lastHomeSearch = useRef("");
  useEffect(() => {
    if (pathname === "/") lastHomeSearch.current = location.search;
  }, [pathname, location.search]);
  const isReader = pathname.startsWith("/read/");
  const [theme, setTheme] = useState<"dark" | "light">(getStoredTheme);

  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    document.documentElement.classList.remove("light", "dark");
    document.documentElement.classList.add(next);
    document.documentElement.style.colorScheme = next;
    lsSet(KEYS.theme, next);
    setTheme(next);
  };

  const isActive = (routePath: string) => routePath === "/" ? pathname === "/" : pathname.startsWith(routePath);

  const closeMenu = useCallback(() => {
    setIsOpen(false);
    menuBtnRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const nav = navRef.current;
    if (!nav) return;
    const focusable = nav.querySelectorAll<HTMLElement>(
      'a[href],button:not([disabled]),input,select,textarea,[tabindex]:not([tabindex="-1"])'
    );
    if (focusable.length > 0) focusable[0].focus();

    const trapFocus = (event: KeyboardEvent) => {
      if (event.key === "Escape") { closeMenu(); return; }
      if (event.key !== "Tab") return;
      const first = focusable[0];
      const last  = focusable[focusable.length - 1];
      if (event.shiftKey) {
        if (document.activeElement === first) { event.preventDefault(); last.focus(); }
      } else {
        if (document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener("keydown", trapFocus);
    return () => document.removeEventListener("keydown", trapFocus);
  }, [isOpen, closeMenu]);

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
              onClick={toggleTheme}
              aria-label="Toggle theme"
              className="text-foreground/40 hover:text-foreground active:text-foreground transition-colors"
            >
              {theme === "dark" ? <SunIcon /> : <MoonIcon />}
            </button>
          </div>
        </div>
      </header>

      <header className={`lg:hidden fixed top-0 left-0 right-0 z-20 h-12 bg-bg px-4 flex items-center justify-between transition-opacity duration-300 ${!isReader ? "opacity-100" : "opacity-0 pointer-events-none"}`}>
        <button
          ref={menuBtnRef}
          onClick={() => setIsOpen(true)}
          aria-label="Open menu"
          aria-expanded={isOpen}
          aria-controls="mobile-nav"
          className="text-foreground/60 hover:text-foreground transition-colors outline-none"
        >
          <FiMenu size={28} />
        </button>
        <Link to={`/${lastHomeSearch.current}`} aria-label="Librarytoon">
          <img src="/logo-white.png" alt="Librarytoon" className="h-7 hidden dark:block" draggable={false} />
          <img src="/logo-black.png" alt="Librarytoon" className="h-7 block dark:hidden" draggable={false} />
        </Link>
      </header>

      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm lg:hidden"
          onClick={closeMenu}
          aria-hidden
        />
      )}

      <aside
        id="mobile-nav"
        ref={navRef}
        role="dialog"
        aria-modal="true"
        aria-label="Navigation menu"
        className={`fixed left-0 top-0 z-50 h-screen w-[70%] max-w-[280px] bg-bg border-r border-dashed border-edge
                    transition-transform duration-300 lg:hidden
                    ${isOpen ? "translate-x-0" : "-translate-x-full"}`}
      >
        <div className="h-12 px-4 flex items-center justify-between">
          <button
            onClick={closeMenu}
            aria-label="Close menu"
            className="text-foreground/60 hover:text-foreground transition-colors outline-none"
          >
            <FiX size={24} />
          </button>
          <button
            onClick={toggleTheme}
            aria-label="Toggle theme"
            className="w-7 h-7 flex items-center justify-center text-foreground/60 hover:opacity-70 transition-opacity outline-none"
          >
            {theme === "dark" ? <SunIcon /> : <MoonIcon />}
          </button>
        </div>
        <nav className="flex flex-col gap-6 px-6 pt-8">
          <Link
            to={`/${lastHomeSearch.current}`}
            onClick={closeMenu}
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
            onClick={closeMenu}
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
            onClick={closeMenu}
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
