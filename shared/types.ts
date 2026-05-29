export type SourceInfo = {
  id: string;
  baseUrl: string;
  enabled: boolean;
  color?: string;
  name?: string;
  language?: string;
  contentRating?: "sfw" | "nsfw" | "mixed";
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

export type ChapterBoundary = {
  chapterId: string;
  chapterNumber: number;
  chapterTitle: string;
  startIndex: number;
  endIndex: number;
};

export type ReadRangeResult = {
  pages: Page[];
  boundaries: ChapterBoundary[];
  failed: { chapterId: string; reason: string }[];
};

export type ApiRequest<T = unknown> = {
  sourceId: string;
  payload: T;
};

export type SearchPayload = { query: string };
export type ChaptersPayload = { titleId: string };
export type PagesPayload = { chapterId: string };
export type TitleInfoPayload = { titleId: string };
export type ReadRangePayload = {
  titleId: string;
  chapterStart: number;
  chapterEnd: number;
};

export type SourceHealth = {
  ms:          number | null;
  status:      "ok" | "slow" | "error";
  checkedAt:   number;
  nextCheckAt: number;
};

export type HealthSnapshot = {
  sources:     Record<string, SourceHealth>;
  doh:         Record<string, string>;
  intervalMs:  number;
  circuitOpen: string[];
};

export type ApiResponse<T> = {
  ok: boolean;
  data?: T;
  error?: string;
  partial?: boolean;
};

/** How the adapter fetches data from the source */
export type ScrapingMethod = "html" | "wordpress" | "api" | "graphql" | "nextjs" | "nuxtjs";

/** Whether the source uses slug-style IDs or UUID-style IDs */
export type UrlFormat = "slug" | "uuid" | "numeric";

/** CSS selectors for the HTML adapter; every field is optional, falls back to built-in defaults */
export type SourceSelectors = {
  searchItem?: string;
  searchTitle?: string;
  searchCover?: string;
  searchLatestChapter?: string;
  chapterItem?: string;
  chapterLink?: string;
  chapterTitle?: string;
  chapterDate?: string;
  pageImage?: string;
  imageAttr?: string;
  seriesCover?: string;
  seriesDescription?: string;
  seriesGenres?: string;
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

/** Field-name candidates for API chapter objects */
export type ApiChapterFieldMap = {
  id?: string[];
  number?: string[];
  title?: string[];
  date?: string[];
};

/** Field-name candidates for API pages/images response */
export type ApiPageFieldMap = {
  images?: string[];
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
  /** Short description shown in the source picker */
  description?: string;
  /** ISO 639-1 language code of the source content (default: "id") */
  language?: string;
  /** Content rating: "sfw" | "nsfw" | "mixed" (default: "sfw") */
  contentRating?: "sfw" | "nsfw" | "mixed";
  /** Short note for the admin UI (e.g. "requires VPN", "unstable API") */
  note?: string;
  /** Hex color for source badge (e.g. "#f59e0b") */
  color?: string;
  /** Whether this source is officially tested and maintained */
  official?: boolean;

  /** Override User-Agent string for this source */
  userAgent?: string;
  /** Custom HTTP headers merged on top of default User-Agent */
  headers?: Record<string, string>;
  /** Extra HTTP headers merged on top of defaults (legacy name) */
  customHeaders?: Record<string, string>;
  /** Per-operation timeout overrides in ms (defaults: search 10000, chapters/pages 20000) */
  timeouts?: { search?: number; chapters?: number; pages?: number };
  /** Max concurrent requests from this source */
  concurrencyLimit?: number;
  /** Per-source retry count on 5xx / timeout errors */
  retries?: number;
  /** Additional HTTP status codes to retry on */
  retryOn?: number[];
  /** Static delay in ms between retries (instead of exponential backoff) */
  retryDelay?: number;

  /** Query parameter name for search (e.g. "q", "title", "s") */
  searchParam?: string;
  /** Ordered URL templates tried for search ({base}, {q} are replaced) */
  searchEndpoints?: string[];
  /** Max results to request per search call (default: 20) */
  searchLimit?: number;
  /** Set false to disable search */
  searchSupported?: boolean;
  /** Set false to disable the Madara AJAX fallback (/wp-admin/admin-ajax.php) */
  searchAjaxFallback?: boolean;
  /** Set false to disable the full-page listing fallback */
  searchListingFallback?: boolean;
  /** Custom URL for the full series listing page used as search fallback */
  listingUrl?: string;

  /** Extract title from the segment after " | " in a <title> tag */
  titleAfterPipe?: boolean;
  /** Same as titleAfterPipe, preferred name */
  titleFromPipe?: boolean;
  seriesPath?: { prefix?: string; suffix?: string };
  chapterPath?: { prefix?: string; suffix?: string };
  /** Whether chapter IDs contain nested path segments (e.g. "series-slug/chapter-1") */
  nestedChapterIds?: boolean;
  idPattern?: string;
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
  imageExtensions?: string[];
  /** Keywords in src/alt/class that mark non-content images to skip */
  imageExcludeKeywords?: string[];
  imageBase64Encoded?: boolean;
  imageUrlPattern?: string;
  /** Replacement string for imageUrlPattern (supports $1, $2 capture groups) */
  imageUrlReplacement?: string;
  imageStripQueryParams?: boolean;
  /** Minimum image width in pixels to be considered a content image */
  imageMinWidth?: number;

  selectors?: SourceSelectors;

  wpApiPath?: string;
  /** Skip the ReaderKiru API entirely (saves a failed probe request for non-RK sites) */
  wpSkipReaderKiru?: boolean;
  wpReaderKiruPath?: string;
  wpMangaEndpoint?: string;
  wpChapterEndpoint?: string;
  wpChaptersPerPage?: number;
  wpCoverBatchSize?: number;
  /** Enable ReaderKiru custom API: "auto" tries RK then falls back; true = RK only; false = skip RK */
  wpReaderKiru?: "auto" | boolean;
  /** WordPress theme variant; skips irrelevant fallback chains */
  wpTheme?: "auto" | "madara" | "wpmanga" | "comicsera" | "generic";
  wpYoastCover?: boolean;
  /** After fetching chapters via API, enrich dates by batch-querying /wp-json/wp/v2/posts?include={ids} */
  wpFetchDates?: boolean;

  apiSearchEndpoints?: string[];
  apiChapterEndpoints?: string[];
  apiPageEndpoints?: string[];
  /** Expected response envelope format (default: "auto", tries all) */
  apiEnvelope?: "auto" | "retcode" | "success" | "wrapped" | "bare" | "laravel";
  apiPagination?: "page" | "offset" | "cursor" | "none";
  apiCursorField?: string;
  apiTotalPagesField?: string;
  apiFieldMap?: ApiFieldMap;
  apiChapterFieldMap?: ApiChapterFieldMap;
  apiPageFieldMap?: ApiPageFieldMap;

  graphqlEndpoint?: string;
  graphqlSearchQuery?: string;
  graphqlSearchVar?: string;
  graphqlChaptersQuery?: string;
  graphqlPagesQuery?: string;
  /** Dot-notation JSON path to the search result array in the GraphQL response */
  graphqlSearchPath?: string;
  graphqlChaptersPath?: string;
  graphqlPagesPath?: string;

  /** Dot-notation path inside __NEXT_DATA__.props.pageProps */
  nextDataPath?: string;
  nextChaptersPath?: string;
  nextPagesPath?: string;
  /** Dot-notation path inside __NUXT__.data[0] */
  nuxtDataPath?: string;
  nuxtChaptersPath?: string;
  nuxtPagesPath?: string;

  rateLimit?: number;
  /** Cool-down in ms after receiving a 429 response */
  rateLimitCooldown?: number;

  /** Fields known to be unavailable from this source; suppresses audit false-positives */
  knownMissing?: string[];
};
