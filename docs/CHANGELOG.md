# Changelog

All notable changes to Librarytoon will be documented in this file.

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
