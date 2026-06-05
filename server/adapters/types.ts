import type { Chapter, Page, SearchResult, SourceInfo } from "../../shared/types.js";

export interface SourceAdapter {
  info: SourceInfo;
  search(query: string, signal?: AbortSignal): Promise<SearchResult[]>;
  getChapters(titleId: string, signal?: AbortSignal): Promise<Chapter[]>;
  getPages(chapterId: string, signal?: AbortSignal): Promise<Page[]>;
  getTitleInfo?(titleId: string): Promise<SearchResult | null>;
}
