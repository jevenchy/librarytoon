export const API_BASE = "/api";

export const ENDPOINTS = {
  search: `${API_BASE}/search`,
  chapters: `${API_BASE}/chapters`,
  pages: `${API_BASE}/pages`,
  readRange: `${API_BASE}/read-range`,
  sources: `${API_BASE}/sources`,
  sourceConfigs: `${API_BASE}/source-configs`,
  titleInfo: `${API_BASE}/title-info`,
  health: `${API_BASE}/health`,
} as const;

export const CACHE_TTL_MS = {
  search: 1000 * 60 * 5,
  chapters: 1000 * 60 * 10,
  pages: 1000 * 60 * 30
} as const;

export const DEFAULT_PORT = 4000;

export const MAX_RANGE_CHAPTERS = 50;
