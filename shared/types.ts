export type SourceInfo = {
  id: string;
  baseUrl: string;
  enabled: boolean;
  method?: ScrapingMethod;
  urlFormat?: UrlFormat;
  color?: string;
  name?: string;
  language?: string;
  contentRating?: "sfw" | "nsfw";
  note?: string;
};

export type SearchResult = {
  id: string;
  title: string;
  cover: string;
  sourceId: string;
  slug?: string;
  latestChapter?: number;
  description?: string;
  genres?: string[];
  type?: string;
  seriesUpdatedAt?: string;
  alternativeTitle?: string;
};

export type Chapter = {
  id: string;
  title: string;
  number: number;
  sourceId?: string;
  titleId?: string;
  chapterUpdatedAt?: string;
};

export type Page = {
  chapterId: string;
  imageUrl: string;
  index: number;
};

export type ChaptersResult = {
  chapters: Chapter[];
  total:    number;
  partial:  boolean;
  warning?: string;
};

export type ChaptersPayload = { titleId: string };
export type PagesPayload = { chapterId: string };
export type TitleInfoPayload = { titleId: string };
export type ApiResponse<T> = {
  ok: boolean;
  data?: T;
  error?: string;
  partial?: boolean;
};

export type ScrapingMethod = "html" | "wordpress" | "api";

export type UrlFormat = "slug" | "uuid" | "numeric";

/** CSS selectors for the HTML adapter. Every field is optional and falls back to built-in defaults */
export type SourceSelectors = {
  searchItem?: string;
  searchTitle?: string;
  searchCover?: string;
  searchLatestChapter?: string;
  chapterItem?: string;
  chapterLink?: string;
  chapterTitle?: string;
  chapterDate?: string;
  chapterDateAttr?: string;
  chapterItemLocked?: string;
  pageImage?: string;
  imageAttr?: string;
  seriesCover?: string;
  seriesDescription?: string;
  seriesDescriptionAstroKey?: string;
  seriesCoverAstroKey?: string;
  seriesAltTitleAstroKey?: string;
  seriesGenres?: string;
  seriesType?: string;
  seriesAltTitle?: string;
};

/** Field-name candidates for API search result objects (tried left-to-right) */
export type ApiFieldMap = {
  id?: string[];
  title?: string[];
  cover?: string[];
  chapter?: string[];
  type?: string[];
  genres?: string[];
};

export type ApiChapterFieldMap = {
  id?: string[];
  number?: string[];
  title?: string[];
  date?: string[];
};

export type ApiPageFieldMap = {
  images?: string[];
};

export type WordpressConfig = {
  theme?: "auto" | "madara" | "wpmanga" | "comicsera" | "generic";
  apiPath?: string;
  readerKiru?: "auto" | boolean;
  readerKiruPath?: string;
  skipReaderKiru?: boolean;
  seriesEndpoint?: string;
  chapterEndpoint?: string;
  chaptersPerPage?: number;
  coverBatchSize?: number;
  yoastCover?: boolean;
  /** After fetching chapters via API, enrich dates by batch-querying /wp-json/wp/v2/posts?include={ids} */
  fetchDates?: boolean;
  search?: { ajaxFallback?: boolean };
};

export type ApiConfig = {
  envelope?: "auto" | "retcode" | "success" | "wrapped" | "bare" | "laravel";
  pagination?: "page" | "offset" | "cursor" | "none";
  cursorField?: string;
  totalPagesField?: string;
  searchEndpoints?: string[];
  titleInfoEndpoints?: string[];
  chapterEndpoints?: string[];
  pageEndpoints?: string[];
  slugSuffix?: string;
  fieldMap?: ApiFieldMap;
  chapterFieldMap?: ApiChapterFieldMap;
  pageFieldMap?: ApiPageFieldMap;
};

export type SearchConfig = {
  param?: string;
  endpoints?: string[];
  limit?: number;
  supported?: boolean;
  ajaxFallback?: boolean;
  listingFallback?: boolean;
  listingUrl?: string;
};

export type ImagesConfig = {
  extensions?: string[];
  excludeKeywords?: string[];
  base64Encoded?: boolean;
  urlPattern?: string;
  urlReplacement?: string;
  stripQueryParams?: boolean;
  minWidth?: number;
  coverOptimizer?: string;
};

export type NetworkConfig = {
  userAgent?: string;
  headers?: Record<string, string>;
  timeouts?: { search?: number; chapters?: number; pages?: number };
  concurrencyLimit?: number;
  retries?: number;
  retryOn?: number[];
  retryDelay?: number;
  rateLimit?: number;
  rateLimitCooldown?: number;
};

export type SourceConfig = {
  id: string;
  baseUrl: string;
  method: ScrapingMethod;
  urlFormat: UrlFormat;
  seriesUrl: string;
  chapterUrl: string;
  apiBase: string;
  enabled: boolean;
  createdAt?: string;

  /** Human-readable source name shown in the UI (default: capitalized id) */
  name?: string;
  description?: string;
  /** ISO 639-1 language code of the source content (default: "id") */
  language?: string;
  /** Content rating: "sfw" | "nsfw" (default: "sfw") */
  contentRating?: "sfw" | "nsfw";
  /** Short note for the admin UI (e.g. "requires VPN", "unstable API") */
  note?: string;
  /** Hex color for source badge (e.g. "#f59e0b") */
  color?: string;
  official?: boolean;

  /** Extract title from the segment after " | " in a <title> tag */
  titleAfterPipe?: boolean;
  /** Same as titleAfterPipe, preferred name */
  titleFromPipe?: boolean;
  seriesPath?: { prefix?: string; suffix?: string };
  chapterPath?: { prefix?: string; suffix?: string };
  /** Whether chapter IDs contain nested path segments (e.g. "series-slug/chapter-1") */
  nestedChapterIds?: boolean;
  /** Regex string to extract chapter number (capture group 1 = number) */
  chapterNumberPattern?: string;
  /** True if the source already returns chapters in ascending order */
  chaptersAscending?: boolean;
  chapterDeduplicate?: boolean;
  chapterBatchSize?: number;
  /** Prefix chapter IDs with "{titleId}/" so pages adapter builds /api/read/{titleId}/{chapterSlug} */
  chapterIdWithTitle?: boolean;

  /** Route images through /api/img proxy (for DNS-blocked domains) */
  proxyImages?: boolean;
  /** Separate CDN domain for images (relative paths resolved against this) */
  imageCdn?: string;
  /** Referer header sent with proxied image requests */
  imageReferer?: string;

  /** Next.js App Router source: chapters/pages embedded in the RSC stream, not the DOM */
  nextRsc?: boolean;

  selectors?: SourceSelectors;

  wordpress?: WordpressConfig;
  api?: ApiConfig;
  search?: SearchConfig;
  images?: ImagesConfig;
  network?: NetworkConfig;
  /** Ordered fallback method chain (default: ["html"]) */
  fallback?: ScrapingMethod[];

  /** Fields known to be unavailable from this source. Suppresses audit false-positives */
  knownMissing?: string[];
};
