// Sized for a full chapter. resetPreloadCache() clears the set on every chapter change.
const MAX_PRELOAD_SEEN = 500;
const SEEN = new Set<string>();

export function resetPreloadCache(): void {
  SEEN.clear();
}

export function preloadImages(urls: string[]): void {
  for (const url of urls) {
    if (!url || SEEN.has(url)) continue;
    if (SEEN.size >= MAX_PRELOAD_SEEN) {
      const first = SEEN.values().next().value;
      if (first !== undefined) SEEN.delete(first);
    }
    SEEN.add(url);
    const img = new Image();
    img.decoding = "async";
    img.loading = "eager";
    img.src = url;
  }
}
