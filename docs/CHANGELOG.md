# Changelog

All notable changes to Librarytoon will be documented in this file.

---

## [1.3.0] - 2026-06-10

### Added

- Images: `/api/img?w=200|400` resizes covers via `sharp`, with graceful degradation if `sharp` is unavailable (`IMG_RESIZE_WIDTHS` env var, `imgResizeAvailable` in `/api/health`)

### Changed

- Home/Search/Bookmarks: cover images now request a resized variant and use `loading="lazy" decoding="async"`, reducing browser memory usage on cover grids
- Bookmarks: card metadata enrichment now waits until a card scrolls near the viewport instead of firing for every card on mount
- Sources: one additional source now proxies covers through `/api/img`
- Detail: cover for one adapter config no longer gets replaced by a generated social-card image once metadata loads

### Fixed

- Search: listing fallback title extraction now prefers the link title over cover image alt text, fixing malformed titles derived from alt text

---

## [1.2.0] - 2026-06-10

### Added

- Search: dedicated `/search` page, separated from Home/Discover, with source filter chips, online/offline detection, and retry on failure
- Navbar: collapsible search input in the desktop header, restructured mobile header and drawer
- Bookmarks: sort toggle (newest/oldest)
- Adapters: fall back to the chapter list for latest chapter and last-updated date when a source keeps chapters in a separate post type

### Changed

- Home: simplified to Discover-only (hero carousel + source grid)
- UI: refreshed card, badge, filter-tab, and button styling, wider content max-width, new badge color for overlays on cover images
- Sources: filterable by language and content rating, restructured add-source modal

---

## [1.1.0] - 2026-06-07

### Added

- Sources: 5 new manga/manhwa sources
- Adapters: configurable `chapterIdTemplate`, `wpTermMap`, `chapterListAppend`, `chapterHrefAttr`, and `alternativeTitle` field mapping

### Fixed

- Sources: corrected config and re-enabled 4 sources that were broken or disabled
- Detail: missing or blank genre, type, alternative title, cover, and last-updated date for some sources
- Chapters/pages: stale empty-result caching that kept Retry from re-fetching after a transient failure

---

## [1.0.0] - 2026-06-05

### Added

- Search: cross-source search, language & content rating filters, source chips, URL persistence, keyboard shortcut
- Detail: series metadata, bookmark toggle, resume reading, metadata & chapter cache with TTL
- Reader: vertical scroll reader, autoscroll, scroll restore, progress tracking, chapter nav, slow/timeout handling
- Bookmarks: locally stored, filterable by language, rating, and source
- Sources: source list with status, add-source modal with JSON template
- Server: HTML/WordPress/API adapters, DoH, image proxy, singleFlight, LRU cache, rate limiting, hot-reload
- UI/UX: dark/light theme, responsive layout, accessibility (ARIA, focus trap, skip-to-content), skeleton & error states
- DX: monorepo, shared TypeScript types, tsx dev server, unified build script, source audit scripts, Vitest
