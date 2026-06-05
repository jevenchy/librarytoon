import type {
  ApiResponse,
  Chapter,
  ChaptersPayload,
  ChaptersResult,
  TitleInfoPayload,
  Page,
  PagesPayload,
  SearchResult,
  SourceInfo
} from "../../../shared/types.js";

const API_BASE = "/api";
const ENDPOINTS = {
  search:    `${API_BASE}/search`,
  chapters:  `${API_BASE}/chapters`,
  pages:     `${API_BASE}/pages`,
  sources:   `${API_BASE}/sources`,
  titleInfo: `${API_BASE}/title-info`,
} as const;

async function post<T, P>(url: string, body: P, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  const json = (await res.json()) as ApiResponse<T>;
  if (!json.ok || json.data === undefined) {
    throw new Error(json.error ?? `Request failed: ${url}`);
  }
  return json.data;
}

type SearchOpts = { sourceId?: string | null; language?: "id" | "en"; contentRating?: "sfw" | "nsfw" };
type SearchBody = { query: string } & SearchOpts;

function search(query: string, opts: { sourceId: string; language?: "id" | "en"; contentRating?: "sfw" | "nsfw" }, signal?: AbortSignal): Promise<SearchResult[]>;
function search(query: string, opts?: SearchOpts, signal?: AbortSignal): Promise<{ sourceId: string; results: SearchResult[] }[]>;
function search(query: string, opts?: SearchOpts, signal?: AbortSignal) {
  if (opts?.sourceId) {
    return post<SearchResult[], SearchBody>(ENDPOINTS.search, { query, ...opts }, signal);
  }
  return post<{ sourceId: string; results: SearchResult[] }[], SearchBody>(ENDPOINTS.search, { query, ...opts }, signal);
}

export const API = {
  sources: async (): Promise<SourceInfo[]> => {
    const res = await fetch(ENDPOINTS.sources);
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${ENDPOINTS.sources}`);
    const json = (await res.json()) as ApiResponse<SourceInfo[]>;
    return json.data ?? [];
  },

  search,

  titleInfo: (sourceId: string, titleId: string, signal?: AbortSignal) =>
    post<SearchResult | null, { sourceId: string; payload: TitleInfoPayload }>(
      ENDPOINTS.titleInfo, { sourceId, payload: { titleId } }, signal
    ),

  chapters: async (sourceId: string, titleId: string, signal?: AbortSignal): Promise<ChaptersResult> => {
    const res = await fetch(ENDPOINTS.chapters, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sourceId, payload: { titleId } satisfies ChaptersPayload }),
      signal,
    });
    const json = (await res.json()) as ApiResponse<Chapter[]> & { total?: number; warning?: string };
    if (!json.ok) throw new Error(json.error ?? `Request failed: ${ENDPOINTS.chapters}`);
    return {
      chapters: json.data ?? [],
      total:    json.total ?? (json.data?.length ?? 0),
      partial:  json.partial ?? false,
      warning:  json.warning,
    };
  },

  pages: (sourceId: string, chapterId: string, signal?: AbortSignal) =>
    post<Page[], { sourceId: string; payload: PagesPayload }>(
      ENDPOINTS.pages, { sourceId, payload: { chapterId } }, signal
    ),
};
