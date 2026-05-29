import type {
  ApiResponse,
  Chapter,
  ChaptersPayload,
  HealthSnapshot,
  TitleInfoPayload,
  Page,
  PagesPayload,
  ReadRangePayload,
  ReadRangeResult,
  SearchPayload,
  SearchResult,
  SourceConfig,
  SourceInfo
} from "../../../shared/types";

const API_BASE = "/api";
const ENDPOINTS = {
  search:        `${API_BASE}/search`,
  chapters:      `${API_BASE}/chapters`,
  pages:         `${API_BASE}/pages`,
  readRange:     `${API_BASE}/read-range`,
  sources:       `${API_BASE}/sources`,
  sourceConfigs: `${API_BASE}/source-configs`,
  titleInfo:     `${API_BASE}/title-info`,
  health:        `${API_BASE}/health`,
} as const;

async function post<T, P>(url: string, body: { sourceId: string; payload: P }): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const json = (await res.json()) as ApiResponse<T>;
  if (!json.ok || json.data === undefined) {
    throw new Error(json.error ?? `Request failed: ${url}`);
  }
  return json.data;
}

export const api = {
  sources: async (): Promise<SourceInfo[]> => {
    const res = await fetch(ENDPOINTS.sources);
    const json = (await res.json()) as ApiResponse<SourceInfo[]>;
    return json.data ?? [];
  },
  search: (sourceId: string, query: string) =>
    post<SearchResult[], SearchPayload>(ENDPOINTS.search, { sourceId, payload: { query } }),
  titleInfo: (sourceId: string, titleId: string) =>
    post<SearchResult | null, TitleInfoPayload>(ENDPOINTS.titleInfo, { sourceId, payload: { titleId } }),
  chapters: (sourceId: string, titleId: string) =>
    post<Chapter[], ChaptersPayload>(ENDPOINTS.chapters, { sourceId, payload: { titleId } }),
  pages: (sourceId: string, chapterId: string) =>
    post<Page[], PagesPayload>(ENDPOINTS.pages, { sourceId, payload: { chapterId } }),
  readRange: (sourceId: string, titleId: string, chapterStart: number, chapterEnd: number) =>
    post<ReadRangeResult, ReadRangePayload>(ENDPOINTS.readRange, {
      sourceId,
      payload: { titleId, chapterStart, chapterEnd }
    }),

  health: async (): Promise<HealthSnapshot> => {
    const res  = await fetch(ENDPOINTS.health);
    const json = (await res.json()) as ApiResponse<HealthSnapshot>;
    return json.data ?? { sources: {}, doh: {}, intervalMs: 300_000, circuitOpen: [] };
  },

  // Source config CRUD
  sourceConfigs: {
    list: async (): Promise<SourceConfig[]> => {
      const res = await fetch(ENDPOINTS.sourceConfigs);
      const json = (await res.json()) as ApiResponse<SourceConfig[]>;
      return json.data ?? [];
    },
    create: async (data: Omit<SourceConfig, "id" | "createdAt">): Promise<SourceConfig> => {
      const res = await fetch(ENDPOINTS.sourceConfigs, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data)
      });
      const json = (await res.json()) as ApiResponse<SourceConfig>;
      if (!json.ok || !json.data) throw new Error(json.error ?? "Create failed");
      return json.data;
    },
    update: async (id: string, data: Partial<SourceConfig>): Promise<SourceConfig> => {
      const res = await fetch(`${ENDPOINTS.sourceConfigs}/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data)
      });
      const json = (await res.json()) as ApiResponse<SourceConfig>;
      if (!json.ok || !json.data) throw new Error(json.error ?? "Update failed");
      return json.data;
    },
    delete: async (id: string): Promise<void> => {
      await fetch(`${ENDPOINTS.sourceConfigs}/${id}`, { method: "DELETE" });
    }
  }
};
