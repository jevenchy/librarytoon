import type { Chapter, Page, SearchResult, SourceInfo } from "../../shared/types.js";

export interface SourceAdapter {
  info: SourceInfo;
  search(query: string): Promise<SearchResult[]>;
  getChapters(titleId: string): Promise<Chapter[]>;
  getPages(chapterId: string): Promise<Page[]>;
  getTitleInfo?(titleId: string): Promise<SearchResult | null>;
}
