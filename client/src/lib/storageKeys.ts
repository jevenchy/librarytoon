export const KEYS = {
  bookmarks: "lt:bookmarks",
  theme:     "lt:ui:theme",
  sourceId:  "lt:ui:sourceId",
  lastRead:      (s: string, t: string) => `lt:lastRead:${s}:${t}`,
  metaCache:     (s: string, t: string) => `lt:cache:meta:${s}:${t}`,
  chaptersCache: (s: string, t: string) => `lt:cache:chapters:${s}:${t}`,
  readChapters:  (s: string, t: string) => `lt:read:${s}:${t}`,
  scroll:        (s: string, t: string, c: string) => `lt:scroll:${s}:${t}:${c}`,
} as const;

export function migrateStorageKeys(): void {
  try {
    const renames: Array<[string, string]> = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key) continue;
      let next: string | null = null;
      if      (key === "bookmarks")           next = KEYS.bookmarks;
      else if (key === "theme")               next = KEYS.theme;
      else if (key === "mm.sourceId")         next = KEYS.sourceId;
      else if (key.startsWith("lr:"))         next = `lt:lastRead:${key.slice(3)}`;
      else if (key.startsWith("meta-cache:")) next = `lt:cache:meta:${key.slice(11)}`;
      else if (key.startsWith("ch-cache:"))   next = `lt:cache:chapters:${key.slice(9)}`;
      else if (key.startsWith("read:"))       next = `lt:read:${key.slice(5)}`;
      else if (key.startsWith("scroll:"))     next = `lt:scroll:${key.slice(7)}`;
      if (next && next !== key) renames.push([key, next]);
    }
    for (const [old, next] of renames) {
      const value = localStorage.getItem(old);
      if (value !== null) {
        if (localStorage.getItem(next) === null) localStorage.setItem(next, value);
        localStorage.removeItem(old);
      }
    }
  } catch {}
}
