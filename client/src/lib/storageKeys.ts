export const KEYS = {
  bookmarks: "lt:bookmarks",
  theme:     "lt:ui:theme",
  language:      "lt:ui:language",
  contentRating: "lt:ui:content-rating",
  sourceId:  "lt:ui:source-id",
  lastRead:      (sourceId: string, titleId: string) => `lt:last-read:${sourceId}:${titleId}`,
  metaCache:     (sourceId: string, titleId: string) => `lt:cache:meta:${sourceId}:${titleId}`,
  chaptersCache: (sourceId: string, titleId: string) => `lt:cache:chapters:${sourceId}:${titleId}`,
  readChapters:  (sourceId: string, titleId: string) => `lt:read:${sourceId}:${titleId}`,
  scroll:        (sourceId: string, titleId: string, chapterId: string) => `lt:scroll:${sourceId}:${titleId}:${chapterId}`,
  scrollPage:    (sourceId: string, titleId: string, chapterId: string) => `lt:scroll-page:${sourceId}:${titleId}:${chapterId}`,
  autoScrollSpeed: "lt:ui:auto-scroll-speed",
} as const;

export function lsSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    try {
      const tsOf = (lsKey: string): number => {
        try { return (JSON.parse(localStorage.getItem(lsKey) ?? "{}") as Record<string, unknown>).ts as number ?? 0; } catch { return 0; }
      };
      const cacheKeys = Object.keys(localStorage)
        .filter(cacheKey => cacheKey.startsWith("lt:cache:"))
        .sort((cacheKeyA, cacheKeyB) => tsOf(cacheKeyA) - tsOf(cacheKeyB));
      for (const cacheKey of cacheKeys.slice(0, 10)) {
        localStorage.removeItem(cacheKey);
      }
      Object.keys(localStorage)
        .filter(scrollKey => scrollKey.startsWith("lt:scroll:") || scrollKey.startsWith("lt:scroll-page:"))
        .slice(0, 10)
        .forEach(scrollKey => localStorage.removeItem(scrollKey));
      localStorage.setItem(key, value);
    } catch {
      // If still failing, silently skip - better to lose one write than crash
    }
  }
}

export function lsGet(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}

// Trusts the class resolved by the anti-FOUC script for system/unset preference.
export function getStoredTheme(): "dark" | "light" {
  const stored = lsGet(KEYS.theme);
  if (stored === "light" || stored === "dark") return stored;
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

export function migrateStorageKeys(): void {
  try {
    if (lsGet("lt:migrated")) return;
    const renames: Array<[string, string]> = [];
    for (const key of Object.keys(localStorage)) {
      let next: string | null = null;
      if      (key === "bookmarks")           next = KEYS.bookmarks;
      else if (key === "theme")               next = KEYS.theme;
      else if (key === "mm.sourceId")         next = KEYS.sourceId;
      else if (key.startsWith("lr:"))         next = `lt:last-read:${key.slice(3)}`;
      else if (key.startsWith("meta-cache:")) next = `lt:cache:meta:${key.slice(11)}`;
      else if (key.startsWith("ch-cache:"))   next = `lt:cache:chapters:${key.slice(9)}`;
      else if (key.startsWith("read:"))       next = `lt:read:${key.slice(5)}`;
      else if (key.startsWith("scroll:"))     next = `lt:scroll:${key.slice(7)}`;
      if (next && next !== key) renames.push([key, next]);
    }
    for (const [old, next] of renames) {
      const value = localStorage.getItem(old);
      if (value !== null) {
        if (localStorage.getItem(next) === null) lsSet(next, value);
        localStorage.removeItem(old);
      }
    }
    lsSet("lt:migrated", "1");
  } catch {}
}
