import { useEffect, useRef, useState, useCallback, type FormEvent } from "react";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import { FiGlobe, FiMoon, FiSearch, FiSun, FiX, FiMenu } from "react-icons/fi";
import { KEYS, lsSet, getStoredTheme } from "../../lib/storageKeys.js";

export default function Layout() {
  const location    = useLocation();
  const navigate    = useNavigate();
  const { pathname } = location;
  const [isOpen, setIsOpen] = useState(false);
  const [headerQuery, setHeaderQuery] = useState("");
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const menuBtnRef       = useRef<HTMLButtonElement>(null);
  const navRef           = useRef<HTMLElement>(null);
  const searchInputRef   = useRef<HTMLInputElement>(null);
  const searchBtnRef     = useRef<HTMLButtonElement>(null);
  const searchBoxRef     = useRef<HTMLDivElement>(null);
  const wasSearchOpenRef = useRef(false);

  const isOnSearchPage = pathname === "/search";

  useEffect(() => {
    setHeaderQuery("");
    setIsSearchOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (isSearchOpen) {
      searchInputRef.current?.focus();
    } else if (wasSearchOpenRef.current) {
      searchBtnRef.current?.focus();
    }
    wasSearchOpenRef.current = isSearchOpen;
  }, [isSearchOpen]);

  useEffect(() => {
    if (!isSearchOpen) return;
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (!searchBoxRef.current?.contains(event.target as Node)) setIsSearchOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsSearchOpen(false);
    };
    document.addEventListener("mousedown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [isSearchOpen]);

  useEffect(() => {
    if (isOnSearchPage) return;
    const openOnSlash = (event: KeyboardEvent) => {
      if (event.key !== "/") return;
      const target = event.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) return;
      event.preventDefault();
      setIsSearchOpen(true);
    };
    document.addEventListener("keydown", openOnSlash);
    return () => document.removeEventListener("keydown", openOnSlash);
  }, [isOnSearchPage]);

  const lastSearch = useRef("");
  useEffect(() => {
    if (pathname === "/search") lastSearch.current = location.search;
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

  const submitHeaderSearch = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = headerQuery.trim();
    navigate(trimmed ? `/search?q=${encodeURIComponent(trimmed)}` : "/search");
  };

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

      <header className={`hidden lg:block sticky top-0 z-20 bg-bg border-b-2 border-dashed border-edge transition-opacity duration-300 ${!isReader ? "opacity-100" : "opacity-0 pointer-events-none h-0 overflow-hidden"}`}>
        <div className="mx-auto max-w-content px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <Link to="/" className="select-none" aria-label="Librarytoon">
              <img src="/logo-white.png" alt="Librarytoon" className="h-7 hidden dark:block" draggable={false} />
              <img src="/logo-black.png" alt="Librarytoon" className="h-7 block dark:hidden" draggable={false} />
            </Link>
            <Link
              to="/"
              className={`text-sm font-semibold uppercase tracking-wide transition-colors ${
                isActive("/")
                  ? "text-foreground underline decoration-2 underline-offset-4"
                  : "text-foreground/60 hover:text-foreground active:text-foreground"
              }`}
            >
              Discover
            </Link>
            <Link
              to="/bookmarks"
              className={`text-sm font-semibold uppercase tracking-wide transition-colors ${
                isActive("/bookmarks")
                  ? "text-foreground underline decoration-2 underline-offset-4"
                  : "text-foreground/60 hover:text-foreground active:text-foreground"
              }`}
            >
              Bookmarks
            </Link>
          </div>
          <div className="flex items-center">
            {isOnSearchPage ? (
              <Link
                to={`/search${lastSearch.current}`}
                aria-label="Search"
                className="text-foreground transition-colors"
              >
                <FiSearch size={22} />
              </Link>
            ) : (
              <div
                ref={searchBoxRef}
                className={`flex items-center overflow-hidden transition-[width] duration-200 ${isSearchOpen ? "w-64 xl:w-80" : "w-10"}`}
              >
                {isSearchOpen ? (
                  <form onSubmit={submitHeaderSearch} role="search" className="relative flex items-center w-full">
                    <FiSearch
                      size={16}
                      className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none text-foreground/40"
                      aria-hidden
                    />
                    <input
                      ref={searchInputRef}
                      type="search"
                      value={headerQuery}
                      onChange={event => setHeaderQuery(event.target.value)}
                      placeholder="Search series..."
                      aria-label="Search series"
                      className="w-full bg-panel border-2 border-dashed border-edge-bright rounded-full
                                 pl-9 pr-4 py-2 text-sm text-foreground/80 placeholder:text-foreground/30
                                 outline-none transition-colors focus:border-foreground/70"
                    />
                  </form>
                ) : (
                  <button
                    ref={searchBtnRef}
                    onClick={() => setIsSearchOpen(true)}
                    aria-label="Search"
                    title="Search (press / to focus)"
                    className="btn-icon"
                  >
                    <FiSearch size={20} />
                  </button>
                )}
              </div>
            )}
            <div className="flex items-center">
              <Link
                to="/sources"
                aria-label="Sources"
                title="Sources"
                className={`inline-flex items-center justify-center w-10 h-10 transition-colors rounded-full ${
                  isActive("/sources") ? "text-foreground" : "text-foreground/40 hover:text-foreground active:text-foreground"
                }`}
              >
                <FiGlobe size={20} />
              </Link>
              <button
                onClick={toggleTheme}
                aria-label="Toggle theme"
                className="btn-icon"
              >
                {theme === "dark" ? <FiSun size={20} /> : <FiMoon size={20} />}
              </button>
            </div>
          </div>
        </div>
      </header>

      <header className={`lg:hidden fixed top-0 left-0 right-0 z-20 h-14 bg-bg border-b-2 border-dashed border-edge px-4 flex items-center justify-between transition-opacity duration-300 ${!isReader ? "opacity-100" : "opacity-0 pointer-events-none"}`}>
        <button
          ref={menuBtnRef}
          onClick={() => setIsOpen(true)}
          aria-label="Open menu"
          aria-expanded={isOpen}
          aria-controls="mobile-nav"
          className="text-foreground/60 hover:text-foreground transition-colors outline-none"
        >
          <FiMenu size={22} />
        </button>
        <Link
          to={isOnSearchPage ? `/search${lastSearch.current}` : "/search"}
          aria-label="Search"
          className="text-foreground/60 hover:text-foreground transition-colors"
        >
          <FiSearch size={22} />
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
        className={`fixed left-0 top-0 z-50 h-screen w-[70%] max-w-[280px] bg-bg border-r-2 border-dashed border-edge
                    transition-transform duration-300 lg:hidden
                    ${isOpen ? "translate-x-0" : "-translate-x-full"}`}
      >
        <div className="h-14 px-4 flex items-center justify-between">
          <button
            onClick={closeMenu}
            aria-label="Close menu"
            className="text-foreground/60 hover:text-foreground transition-colors outline-none"
          >
            <FiX size={20} />
          </button>
          <button
            onClick={toggleTheme}
            aria-label="Toggle theme"
            className="btn-icon"
          >
            {theme === "dark" ? <FiSun size={20} /> : <FiMoon size={20} />}
          </button>
        </div>
        <nav className="flex flex-col gap-6 px-6 pt-8">
          <Link
            to="/"
            onClick={closeMenu}
            className={`text-base font-semibold uppercase transition-colors ${
              isActive("/")
                ? "underline decoration-2 underline-offset-4 text-foreground"
                : "text-foreground/60 hover:text-foreground"
            }`}
          >
            Discover
          </Link>
          <Link
            to={`/search${lastSearch.current}`}
            onClick={closeMenu}
            className={`text-base font-semibold uppercase transition-colors ${
              isActive("/search")
                ? "underline decoration-2 underline-offset-4 text-foreground"
                : "text-foreground/60 hover:text-foreground"
            }`}
          >
            Search
          </Link>
          <Link
            to="/bookmarks"
            onClick={closeMenu}
            className={`text-base font-semibold uppercase transition-colors ${
              isActive("/bookmarks")
                ? "underline decoration-2 underline-offset-4 text-foreground"
                : "text-foreground/60 hover:text-foreground"
            }`}
          >
            Bookmarks
          </Link>
          <Link
            to="/sources"
            onClick={closeMenu}
            className={`text-base font-semibold uppercase transition-colors ${
              isActive("/sources")
                ? "underline decoration-2 underline-offset-4 text-foreground"
                : "text-foreground/60 hover:text-foreground"
            }`}
          >
            Sources
          </Link>
        </nav>
      </aside>

      <main id="main-content" className={`flex-1 relative lg:pt-0 ${!isReader ? "pt-14" : ""}`}>
        <Outlet />
      </main>
    </div>
  );
}
