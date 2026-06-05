export const CACHE_TTL_MS = {
  search:   1000 * 60 * 5,
  chapters: 1000 * 60 * 10,
  pages:    1000 * 60 * 30,
} as const satisfies Record<string, number>;

export const EMPTY_SEARCH_TTL_MS = 60_000;
export const META_CACHE_TTL_MS = 1000 * 60 * 10;

export const DEFAULT_PORT = 4000;

export const DEFAULT_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
