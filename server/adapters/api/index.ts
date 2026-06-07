import type { SourceConfig } from "../../../shared/types.js";
import { proxyCover, processImageUrl, getField } from "../shared.js";

// Shared helpers alongside re-exports. Operation modules import back from here creating a safe cycle.
export function apiBase(cfg: SourceConfig): string {
  return (cfg.apiBase || cfg.baseUrl).replace(/\/$/, "");
}

// Run every cover through proxyCover for consistency. It returns the direct URL when proxyImages is off.
export function apiCover(raw: string | null | undefined, cfg: SourceConfig): string {
  return raw ? proxyCover(processImageUrl(raw, cfg), cfg) : "";
}

export function dedupTitle(title: string): string {
  const half = title.length >> 1;
  if (half > 0 && title.length % 2 === 0 && title.slice(0, half) === title.slice(half)) {
    return title.slice(0, half);
  }
  return title;
}

type Envelope = "auto" | "retcode" | "success" | "wrapped" | "bare" | "laravel" | undefined;

export function matchEnvelope(res: Record<string, unknown>, want: Envelope): boolean {
  if (!want || want === "auto") return true;
  if (want === "retcode") return "retcode" in res;
  if (want === "success") return "success" in res && res.success === true;
  if (want === "wrapped") return "data" in res && !Array.isArray(res) && !("retcode" in res) && !("success" in res);
  if (want === "bare")    return Array.isArray(res);
  if (want === "laravel") return "data" in res && "meta" in res;
  return true;
}

export function applyWpTermMap(
  cfg: SourceConfig,
  item: Record<string, unknown>,
  genres: string[] | undefined,
  type: string | undefined
): { genres: string[] | undefined; type: string | undefined } {
  const wpTermRaw = getField(item, ["_embedded.wp:term"]);
  if (!cfg.api?.wpTermMap || !Array.isArray(wpTermRaw)) return { genres, type };
  const allTerms = (wpTermRaw as Array<Array<{ taxonomy: string; name: string }>>).flat();
  const genreTaxonomy = cfg.api.wpTermMap["genres"];
  if (genreTaxonomy && !genres?.length) {
    const extracted = allTerms.filter(term => term.taxonomy === genreTaxonomy).map(term => term.name).filter(Boolean);
    if (extracted.length) genres = extracted;
  }
  const typeTaxonomy = cfg.api.wpTermMap["type"];
  if (typeTaxonomy) {
    const typeTerm = allTerms.find(term => term.taxonomy === typeTaxonomy);
    if (typeTerm) type = typeTerm.name.toLowerCase();
  }
  return { genres, type };
}

export { apiSearch } from "./search.js";
export { apiChapters } from "./chapters.js";
export { apiPages } from "./pages.js";
export { apiTitleInfo } from "./titleInfo.js";
