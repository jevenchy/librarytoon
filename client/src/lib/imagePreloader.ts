const seen = new Set<string>();

export function resetPreloadCache(): void {
  seen.clear();
}

export function preloadImages(urls: string[]): void {
  for (const url of urls) {
    if (!url || seen.has(url)) continue;
    seen.add(url);
    const img = new Image();
    img.decoding = "async";
    img.loading = "eager";
    img.src = url;
  }
}
