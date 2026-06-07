import { z } from "zod";

export const searchRequestSchema = z.object({
  query: z.string().min(1).max(200),
  sourceId: z.string().min(1).max(100).nullable().optional(),
  language: z.enum(["id", "en"]).optional(),
  contentRating: z.enum(["sfw", "nsfw"]).optional(),
});

export const chaptersPayloadSchema = z.object({
  titleId: z.string().min(1).max(256),
});

export const pagesPayloadSchema = z.object({
  chapterId: z.string().min(1).max(256)
});

export const titleInfoPayloadSchema = z.object({
  titleId: z.string().min(1).max(256)
});

export const apiRequestSchema = <T extends z.ZodTypeAny>(payload: T) =>
  z.object({
    sourceId: z.string().min(1).max(100),
    payload,
  });

const apiFieldMapSchema = z.object({
  id: z.array(z.string()).optional(),
  title: z.array(z.string()).optional(),
  cover: z.array(z.string()).optional(),
  chapter: z.array(z.string()).optional(),
  type: z.array(z.string()).optional(),
  genres: z.array(z.string()).optional(),
  alternativeTitle: z.array(z.string()).optional(),
}).optional();

const apiChapterFieldMapSchema = z.object({
  id: z.array(z.string()).optional(),
  number: z.array(z.string()).optional(),
  title: z.array(z.string()).optional(),
  date: z.array(z.string()).optional(),
}).optional();

const apiPageFieldMapSchema = z.object({
  images: z.array(z.string()).optional(),
}).optional();

export const wordpressConfigSchema = z.object({
  theme: z.enum(["auto", "madara", "wpmanga", "comicsera", "generic"]).optional(),
  apiPath: z.string().optional(),
  readerKiru: z.union([z.enum(["auto"]), z.boolean()]).optional(),
  readerKiruPath: z.string().optional(),
  skipReaderKiru: z.boolean().optional(),
  seriesEndpoint: z.string().optional(),
  chapterEndpoint: z.string().optional(),
  chaptersPerPage: z.number().int().positive().optional(),
  coverBatchSize: z.number().int().positive().optional(),
  yoastCover: z.boolean().optional(),
  fetchDates: z.boolean().optional(),
  search: z.object({ ajaxFallback: z.boolean().optional() }).optional(),
}).strict();

export const apiConfigSchema = z.object({
  envelope: z.enum(["auto", "retcode", "success", "wrapped", "bare", "laravel"]).optional(),
  pagination: z.enum(["page", "offset", "cursor", "none"]).optional(),
  cursorField: z.string().optional(),
  totalPagesField: z.string().optional(),
  searchEndpoints: z.array(z.string()).optional(),
  titleInfoEndpoints: z.array(z.string()).optional(),
  chapterEndpoints: z.array(z.string()).optional(),
  pageEndpoints: z.array(z.string()).optional(),
  slugSuffix: z.string().optional(),
  fieldMap: apiFieldMapSchema,
  chapterFieldMap: apiChapterFieldMapSchema,
  pageFieldMap: apiPageFieldMapSchema,
  chapterIdTemplate: z.string().optional(),
  wpTermMap: z.record(z.string()).optional(),
}).strict();

export const searchConfigSchema = z.object({
  param: z.string().optional(),
  endpoints: z.array(z.string()).optional(),
  limit: z.number().int().positive().optional(),
  supported: z.boolean().optional(),
  ajaxFallback: z.boolean().optional(),
  listingFallback: z.boolean().optional(),
  listingUrl: z.string().optional(),
}).strict();

export const imagesConfigSchema = z.object({
  extensions: z.array(z.string()).optional(),
  excludeKeywords: z.array(z.string()).optional(),
  base64Encoded: z.boolean().optional(),
  urlPattern: z.string().optional(),
  urlReplacement: z.string().optional(),
  stripQueryParams: z.boolean().optional(),
  minWidth: z.number().int().nonnegative().optional(),
  coverOptimizer: z.string().optional(),
}).strict();

export const networkConfigSchema = z.object({
  userAgent: z.string().optional(),
  headers: z.record(z.string()).optional(),
  timeouts: z.object({
    search: z.number().int().positive().optional(),
    chapters: z.number().int().positive().optional(),
    pages: z.number().int().positive().optional(),
  }).optional(),
  concurrencyLimit: z.number().int().positive().optional(),
  retries: z.number().int().nonnegative().optional(),
  retryOn: z.array(z.number().int()).optional(),
  retryDelay: z.number().int().nonnegative().optional(),
  rateLimit: z.number().int().nonnegative().optional(),
  rateLimitCooldown: z.number().int().nonnegative().optional(),
}).strict();

export const sourceConfigSchema = z.object({
  id: z.string().min(1).max(100).regex(/^[a-z0-9-]+$/, "id must be lowercase alphanumeric with dashes"),
  baseUrl: z.string().url(),
  method: z.enum(["html", "wordpress", "api"]),
  urlFormat: z.enum(["slug", "uuid", "numeric"]),
  seriesUrl: z.string(),
  chapterUrl: z.string(),
  apiBase: z.string(),
  enabled: z.boolean(),
  createdAt: z.string().optional(),

  name: z.string().optional(),
  description: z.string().optional(),
  language: z.string().optional(),
  contentRating: z.enum(["sfw", "nsfw"]).optional(),
  note: z.string().optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{3,8}$/, "color must be a hex value").optional(),
  official: z.boolean().optional(),

  titleAfterPipe: z.boolean().optional(),
  titleFromPipe: z.boolean().optional(),
  seriesPath: z.object({ prefix: z.string().optional(), suffix: z.string().optional() }).optional(),
  chapterPath: z.object({ prefix: z.string().optional(), suffix: z.string().optional() }).optional(),
  nestedChapterIds: z.boolean().optional(),
  chapterNumberPattern: z.string().optional(),
  chaptersAscending: z.boolean().optional(),
  chapterDeduplicate: z.boolean().optional(),
  chapterBatchSize: z.number().int().positive().optional(),
  chapterIdWithTitle: z.boolean().optional(),

  proxyImages: z.boolean().optional(),
  // Reject CRLF in imageCdn/imageReferer as a hard invariant against header injection.
  imageCdn: z.string().regex(/^[^\r\n]*$/, "imageCdn must not contain control characters").optional(),
  imageReferer: z.string().regex(/^[^\r\n]*$/, "imageReferer must not contain control characters").optional(),
  nextRsc: z.boolean().optional(),

  selectors: z.object({
    searchItem: z.string().optional(),
    searchTitle: z.string().optional(),
    searchCover: z.string().optional(),
    searchLatestChapter: z.string().optional(),
    chapterItem: z.string().optional(),
    chapterLink: z.string().optional(),
    chapterTitle: z.string().optional(),
    chapterDate: z.string().optional(),
    chapterDateAttr: z.string().optional(),
    chapterItemLocked: z.string().optional(),
    pageImage: z.string().optional(),
    imageAttr: z.string().optional(),
    seriesCover: z.string().optional(),
    seriesDescription: z.string().optional(),
    seriesDescriptionAstroKey: z.string().optional(),
    seriesCoverAstroKey: z.string().optional(),
    seriesAltTitleAstroKey: z.string().optional(),
    seriesGenres: z.string().optional(),
    seriesType: z.string().optional(),
    seriesAltTitle: z.string().optional(),
  }).optional(),

  wordpress: wordpressConfigSchema.optional(),
  api: apiConfigSchema.optional(),
  search: searchConfigSchema.optional(),
  images: imagesConfigSchema.optional(),
  network: networkConfigSchema.optional(),
  fallback: z.array(z.enum(["html", "wordpress", "api"])).optional(),

  knownMissing: z.array(z.string()).optional(),
});

export type SourceConfigInput = z.input<typeof sourceConfigSchema>;
