const PROXY_PREFIX = "/api/img?";

export function resizeImageUrl(url: string | undefined, width: number): string | undefined {
  if (!url || !url.startsWith(PROXY_PREFIX)) return url;
  const [path, query = ""] = url.split("?");
  const params = new URLSearchParams(query);
  params.set("w", String(width));
  return `${path}?${params.toString()}`;
}
