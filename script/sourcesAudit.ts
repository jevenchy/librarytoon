#!/usr/bin/env tsx
// Audit a single source. Usage: npx tsx script/sourcesAudit.ts --source <sourceId>
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { SourceConfig } from "../shared/types.js";
import { LOGGER, COLORS } from "../server/utils/logger.js";
import { writeMarkdown, auditMdPath } from "./reportAudit.js";

export type CoverProbeStatus = "ok" | "fail" | "skip";

function looksLikeImage(bytes: Uint8Array): boolean {
  const matchesAt = (sig: number[], offset: number) =>
    bytes.length >= offset + sig.length && sig.every((byte, idx) => bytes[offset + idx] === byte);
  if (matchesAt([0xff, 0xd8, 0xff], 0)) return true;
  if (matchesAt([0x89, 0x50, 0x4e, 0x47], 0)) return true;
  if (matchesAt([0x47, 0x49, 0x46], 0)) return true;
  if (matchesAt([0x52, 0x49, 0x46, 0x46], 0) && matchesAt([0x57, 0x45, 0x42, 0x50], 8)) return true;
  if (matchesAt([0x66, 0x74, 0x79, 0x70], 4)) return true;
  return false;
}

const SERVER_BASE = `http://localhost:${process.env.PORT ?? 4000}`;

async function probeImage(relUrl: string | null | undefined, referer?: string): Promise<CoverProbeStatus> {
  if (!relUrl) return "skip";
  try {
    let res: Response;
    if (relUrl.startsWith("/api/img")) {
      res = await fetch(`${SERVER_BASE}${relUrl}`, { signal: AbortSignal.timeout(10_000) });
    } else if (/^https?:\/\//.test(relUrl)) {
      res = await fetch(relUrl, {
        signal: AbortSignal.timeout(10_000),
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36",
          ...(referer ? { Referer: referer } : {}),
        },
      });
    } else {
      return "skip";
    }
    if (!res.ok || !res.body) return "fail";
    const reader = res.body.getReader();
    const { value } = await reader.read();
    void reader.cancel();
    return value && value.byteLength > 0 && looksLikeImage(value) ? "ok" : "fail";
  } catch {
    return "fail";
  }
}

const paintOk    = (text: string) => `${COLORS.green}${text}${COLORS.reset}`;
const paintBad   = (text: string) => `${COLORS.red}${text}${COLORS.reset}`;
const paintWarn  = (text: string) => `${COLORS.yellow}${text}${COLORS.reset}`;
const paintDim   = (text: string) => `${COLORS.dim}${text}${COLORS.reset}`;
const fieldTag   = (label: string, present: boolean, value = "OK", known = false) =>
  present ? `${label}:${paintOk(value)}`
          : `${label}:${known ? paintDim("n/a") : paintBad("MISSING")}`;

const API_BASE = `http://localhost:${process.env.PORT ?? 4000}/api`;
const TEST_DIR    = path.dirname(fileURLToPath(import.meta.url));
const SOURCES_DIR = path.join(TEST_DIR, "..", "server", "sources");
const TIMEOUT_MS  = 60_000;

export const SEARCH_FIELDS = [
  "id", "title", "cover", "sourceId",
  "latestChapter", "description", "genres", "type",
  "seriesUpdatedAt", "chapterUpdatedAt", "alternativeTitle",
] as const;

const CHAPTER_FIELDS   = ["id", "title", "number", "sourceId", "titleId", "chapterUpdatedAt"] as const;
const PAGE_FIELDS      = ["chapterId", "imageUrl", "index"] as const;
export const TITLE_INFO_FIELDS = [
  "id", "title", "cover", "sourceId",
  "description", "genres", "type", "seriesUpdatedAt", "alternativeTitle",
] as const;

export const EXPECTED_CONTENT_FIELDS: Record<string, readonly SearchFieldKey[]> = {
  wordpress: [],
  html:      ["genres", "type"],
  api:       ["description", "genres", "type", "seriesUpdatedAt"],
};

const SEARCH_QUERIES: Record<string, string[]> = {
  sfw:   ["nano machine", "academy", "demon"],
  nsfw:  ["secret", "keluarga", "family"],
};

export type SearchFieldKey    = typeof SEARCH_FIELDS[number];
export type ChapterFieldKey   = typeof CHAPTER_FIELDS[number];
export type PageFieldKey      = typeof PAGE_FIELDS[number];
export type TitleInfoFieldKey = typeof TITLE_INFO_FIELDS[number];

export type FieldCoverage<K extends string> = Record<K, boolean | null>;

export type SearchResultSnapshot = {
  id: string;
  title: string;
  cover: string | null;
  coverProbeStatus: CoverProbeStatus | null;
  sourceId: string;
  latestChapter: number | null;
  description: string | null;
  genres: string[] | null;
  type: string | null;
  seriesUpdatedAt: string | null;
  chapterUpdatedAt: string | null;
  alternativeTitle: string | null;
};

export type ChapterSnapshot = {
  id: string;
  title: string | null;
  number: number | null;
  sourceId: string | null;
  titleId: string | null;
  chapterUpdatedAt: string | null;
};

export type PageSnapshot = {
  chapterId: string | null;
  imageUrl: string | null;
  index: number | null;
  imageType: "proxied" | "direct" | "empty";
  probeStatus: CoverProbeStatus | null;
};

export type SearchAudit = {
  status: "ok" | "partial" | "fail";
  queriesAttempted: string[];
  successQuery: string | null;
  totalResults: number;
  top3: SearchResultSnapshot[];
  fieldCoverage: FieldCoverage<SearchFieldKey>;
  error: string | null;
  partial: boolean;
};

export type SearchStyleAudit = {
  titleName: string;
  titleId: string;
  fullTitle:  { query: string; count: number; found: boolean; error: string | null };
  singleWord: { query: string; count: number; found: boolean; error: string | null };
};

export type ChaptersAudit = {
  titleId: string;
  titleName: string;
  status: "ok" | "partial" | "fail";
  total: number;
  first: ChapterSnapshot | null;
  last: ChapterSnapshot | null;
  fieldCoverage: FieldCoverage<ChapterFieldKey>;
  error: string | null;
  partial: boolean;
};

export type PagesAudit = {
  chapterId: string;
  label: "first-chapter" | "last-chapter";
  titleIndex: number;
  status: "ok" | "fail";
  total: number;
  firstImage: PageSnapshot | null;
  lastImage: PageSnapshot | null;
  fieldCoverage: FieldCoverage<PageFieldKey>;
  error: string | null;
};

export type TitleInfoAudit = {
  titleId: string;
  status: "ok" | "partial" | "fail";
  fieldCoverage: FieldCoverage<TitleInfoFieldKey>;
  raw: Record<string, unknown> | null;
  error: string | null;
  coverProbeStatus: CoverProbeStatus | null;
};

export type SourceAuditResult = {
  sourceId: string;
  baseUrl: string;
  method: string;
  contentRating: string;
  color: string;
  auditedAt: string;
  durationMs: number;
  search: SearchAudit;
  searchStyle: SearchStyleAudit[];
  chapters: ChaptersAudit[];
  pages: PagesAudit[];
  titleInfo: TitleInfoAudit[];
  knownMissing: string[];
};

export type AuditFile = {
  runAt: string;
  apiBase: string;
  sources: SourceAuditResult[];
};

type ApiResponse<T> = { ok: boolean; data?: T; error?: string; partial?: boolean };

async function apiPost<T>(endpoint: string, body: object): Promise<ApiResponse<T>> {
  try {
    const res = await fetch(`${API_BASE}/${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    return res.json() as Promise<ApiResponse<T>>;
  } catch (err: unknown) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

function computeCoverage<K extends string>(
  items: Partial<Record<K, unknown>>[],
  keys: readonly K[],
): FieldCoverage<K> {
  const coverage = {} as FieldCoverage<K>;
  for (const fieldKey of keys) {
    coverage[fieldKey] = items.length > 0 && items.some(item => {
      const fieldValue = item[fieldKey];
      return fieldValue != null && fieldValue !== "" && !(Array.isArray(fieldValue) && (fieldValue as unknown[]).length === 0);
    });
  }
  return coverage;
}

function nullCoverage<K extends string>(keys: readonly K[]): FieldCoverage<K> {
  return Object.fromEntries(keys.map(fieldKey => [fieldKey, null])) as FieldCoverage<K>;
}

function snapshotSearch(raw: Record<string, unknown>): SearchResultSnapshot {
  return {
    id:               String(raw.id ?? ""),
    title:            String(raw.title ?? ""),
    cover:            raw.cover != null ? String(raw.cover) : null,
    coverProbeStatus: null,
    sourceId:         String(raw.sourceId ?? ""),
    latestChapter:    raw.latestChapter != null ? Number(raw.latestChapter) : null,
    description:      raw.description != null ? String(raw.description) : null,
    genres:           Array.isArray(raw.genres) ? (raw.genres as string[]) : null,
    type:             raw.type != null ? String(raw.type) : null,
    seriesUpdatedAt:  raw.seriesUpdatedAt  != null ? String(raw.seriesUpdatedAt)  : null,
    chapterUpdatedAt: null,
    alternativeTitle: raw.alternativeTitle != null ? String(raw.alternativeTitle) : null,
  };
}

function snapshotChapter(raw: Record<string, unknown>): ChapterSnapshot {
  return {
    id:               String(raw.id ?? ""),
    title:            raw.title != null ? String(raw.title) : null,
    number:           raw.number != null ? Number(raw.number) : null,
    sourceId:         raw.sourceId != null ? String(raw.sourceId) : null,
    titleId:          raw.titleId != null ? String(raw.titleId) : null,
    chapterUpdatedAt: raw.chapterUpdatedAt != null ? String(raw.chapterUpdatedAt) : null,
  };
}

function snapshotPage(raw: Record<string, unknown>): PageSnapshot {
  const url = raw.imageUrl != null ? String(raw.imageUrl) : null;
  return {
    chapterId:   raw.chapterId != null ? String(raw.chapterId) : null,
    imageUrl:    url,
    index:       raw.index != null ? Number(raw.index) : null,
    imageType:   !url || url === "" ? "empty" : url.startsWith("/api/img") ? "proxied" : "direct",
    probeStatus: null,
  };
}

function thresholdsMet(pool: SearchResultSnapshot[]): boolean {
  if (pool.length < 3) return false;
  const counts = pool.map(snap => snap.latestChapter ?? 0);
  return counts.some(count => count >= 300) && counts.some(count => count >= 200) && counts.some(count => count >= 100);
}

function pickThreeTitles(pool: SearchResultSnapshot[]): SearchResultSnapshot[] {
  const sorted = [...pool].sort((snapA, snapB) => (snapB.latestChapter ?? 0) - (snapA.latestChapter ?? 0));
  const pick300 = sorted.find(snap => (snap.latestChapter ?? 0) >= 300);
  const pick200 = sorted.find(snap => (snap.latestChapter ?? 0) >= 200 && snap.id !== pick300?.id);
  const pick100 = sorted.find(snap => (snap.latestChapter ?? 0) >= 100 && snap.id !== pick300?.id && snap.id !== pick200?.id);
  const selected: SearchResultSnapshot[] = [pick300, pick200, pick100].filter(Boolean) as SearchResultSnapshot[];
  const selectedIds = new Set(selected.map(snap => snap.id));
  for (const snap of sorted) {
    if (selected.length >= 3) break;
    if (!selectedIds.has(snap.id)) { selected.push(snap); selectedIds.add(snap.id); }
  }
  return selected.slice(0, 3);
}

async function auditSearch(source: SourceConfig): Promise<SearchAudit> {
  const contentRating = source.contentRating ?? "sfw";
  const queries = SEARCH_QUERIES[contentRating] ?? SEARCH_QUERIES.sfw;
  const attempted: string[] = [];
  let lastError: string | null = null;
  let successQuery: string | null = null;
  let firstResultCount = 0;
  let anyPartial = false;
  const pool = new Map<string, SearchResultSnapshot>();

  for (const searchQuery of queries) {
    attempted.push(searchQuery);
    const resp = await apiPost<Record<string, unknown>[]>("search", {
      sourceId: source.id,
      query: searchQuery,
    });

    if (!resp.ok) { lastError = resp.error ?? "unknown error"; continue; }
    const items = (resp.data ?? []) as Record<string, unknown>[];
    if (items.length === 0) { lastError = resp.partial ? "partial=true, 0 results" : "empty results"; continue; }

    if (!successQuery) { successQuery = searchQuery; firstResultCount = items.length; }
    if (resp.partial) anyPartial = true;

    for (const item of items) {
      const snap = snapshotSearch(item);
      if (snap.id && !pool.has(snap.id)) pool.set(snap.id, snap);
    }
    if (thresholdsMet([...pool.values()])) break;
  }

  if (pool.size === 0) {
    return {
      status: "fail",
      queriesAttempted: attempted,
      successQuery: null,
      totalResults: 0,
      top3: [],
      fieldCoverage: computeCoverage([], SEARCH_FIELDS),
      error: lastError,
      partial: false,
    };
  }

  const top3Raw = pickThreeTitles([...pool.values()]);

  const enriched = await Promise.all(
    top3Raw.map(async snap => {
      if (snap.description != null && snap.genres != null && snap.alternativeTitle != null) return snap;
      const resp = await apiPost<Record<string, unknown>>("title-info", {
        sourceId: source.id,
        payload: { titleId: snap.id },
      });
      if (!resp.ok || !resp.data) return snap;
      const detail = resp.data as Record<string, unknown>;
      return {
        ...snap,
        description:      snap.description      ?? (detail.description != null ? String(detail.description) : null),
        genres:           snap.genres           ?? (Array.isArray(detail.genres) ? (detail.genres as string[]) : null),
        alternativeTitle: snap.alternativeTitle ?? (detail.alternativeTitle != null ? String(detail.alternativeTitle) : null),
        type:             snap.type             ?? (detail.type != null ? String(detail.type) : null),
        seriesUpdatedAt:  snap.seriesUpdatedAt  ?? (detail.seriesUpdatedAt != null ? String(detail.seriesUpdatedAt) : null),
      };
    })
  );

  const top3 = await Promise.all(
    enriched.map(async snap => ({ ...snap, coverProbeStatus: await probeImage(snap.cover, probeReferer) }))
  );

  const coverage = computeCoverage(top3 as Partial<Record<SearchFieldKey, unknown>>[], SEARCH_FIELDS);
  const requiredPresent = coverage.id && coverage.title;
  const expectedContent = EXPECTED_CONTENT_FIELDS[source.method ?? "html"] ?? [];
  const leanContent = expectedContent.some(fieldKey => !coverage[fieldKey]);
  const status = !requiredPresent ? "fail" : (anyPartial || leanContent) ? "partial" : "ok";

  return {
    status,
    queriesAttempted: attempted,
    successQuery,
    totalResults: firstResultCount,
    top3,
    fieldCoverage: coverage,
    error: anyPartial ? "partial=true from server" : null,
    partial: anyPartial,
  };
}

async function auditSearchStyle(
  sourceId: string,
  title: SearchResultSnapshot,
): Promise<SearchStyleAudit> {
  const words = title.title.split(/[^a-zA-Z0-9]+/).filter(word => word.length >= 4);
  const singleWord = words.sort((wordA, wordB) => wordB.length - wordA.length)[0] ?? title.title.split(/\s+/)[0];

  async function test(query: string) {
    const resp = await apiPost<Record<string, unknown>[]>("search", { sourceId, query });
    if (!resp.ok) return { count: 0, found: false, error: resp.error ?? "error" };
    const items = (resp.data ?? []) as Record<string, unknown>[];
    return { count: items.length, found: items.some(item => String(item.id ?? "") === title.id), error: null as null };
  }

  const [full, single] = await Promise.all([test(title.title), test(singleWord)]);
  return {
    titleName:  title.title,
    titleId:    title.id,
    fullTitle:  { query: title.title, ...full },
    singleWord: { query: singleWord,  ...single },
  };
}

async function auditChapters(
  sourceId: string,
  titleId: string,
  titleName: string,
): Promise<ChaptersAudit> {
  const resp = await apiPost<Record<string, unknown>[]>("chapters", {
    sourceId,
    payload: { titleId },
  });

  if (!resp.ok) {
    return {
      titleId, titleName,
      status: "fail", total: 0, first: null, last: null,
      fieldCoverage: computeCoverage([], CHAPTER_FIELDS),
      error: resp.error ?? "unknown error",
      partial: false,
    };
  }

  const items = (resp.data ?? []) as Record<string, unknown>[];
  const partial = resp.partial ?? false;
  const first = items.length > 0 ? snapshotChapter(items[0]) : null;
  const last  = items.length > 0 ? snapshotChapter(items[items.length - 1]) : null;
  const snapshots = [first, last].filter(Boolean) as ChapterSnapshot[];

  return {
    titleId, titleName,
    status: partial && items.length === 0 ? "fail" : partial ? "partial" : "ok",
    total: items.length,
    first, last,
    fieldCoverage: computeCoverage(snapshots as Partial<Record<ChapterFieldKey, unknown>>[], CHAPTER_FIELDS),
    error: partial ? `partial=true, ${items.length} items` : null,
    partial,
  };
}

async function auditPages(
  sourceId: string,
  chapterId: string,
  label: "first-chapter" | "last-chapter",
  titleIndex: number,
): Promise<PagesAudit> {
  const resp = await apiPost<Record<string, unknown>[]>("pages", {
    sourceId,
    payload: { chapterId },
  });

  if (!resp.ok) {
    return {
      chapterId, label, titleIndex,
      status: "fail", total: 0, firstImage: null, lastImage: null,
      fieldCoverage: computeCoverage([], PAGE_FIELDS),
      error: resp.error ?? "unknown error",
    };
  }

  const items = (resp.data ?? []) as Record<string, unknown>[];
  const firstRaw = items.length > 0 ? snapshotPage(items[0]) : null;
  const lastRaw  = items.length > 0 ? snapshotPage(items[items.length - 1]) : null;

  const [firstProbe, lastProbe] = await Promise.all([
    probeImage(firstRaw?.imageUrl, probeReferer),
    probeImage(lastRaw?.imageUrl, probeReferer),
  ]);
  const first = firstRaw ? { ...firstRaw, probeStatus: firstProbe } : null;
  const last  = lastRaw  ? { ...lastRaw,  probeStatus: lastProbe  } : null;

  const snapshots = [first, last].filter(Boolean) as PageSnapshot[];

  return {
    chapterId, label, titleIndex,
    status: items.length === 0 ? "fail" : "ok",
    total: items.length,
    firstImage: first,
    lastImage: last,
    fieldCoverage: computeCoverage(snapshots as Partial<Record<PageFieldKey, unknown>>[], PAGE_FIELDS),
    error: null,
  };
}

let probeReferer: string | undefined;

async function auditTitleInfo(sourceId: string, titleId: string): Promise<TitleInfoAudit> {
  const resp = await apiPost<Record<string, unknown>>("title-info", {
    sourceId,
    payload: { titleId },
  });

  if (!resp.ok) {
    return {
      titleId,
      status: "fail",
      fieldCoverage: nullCoverage(TITLE_INFO_FIELDS),
      raw: null,
      error: resp.error ?? "unknown error",
      coverProbeStatus: null,
    };
  }

  const raw = (resp.data ?? null) as Record<string, unknown> | null;
  const coverage = raw
    ? computeCoverage([raw as Partial<Record<TitleInfoFieldKey, unknown>>], TITLE_INFO_FIELDS)
    : nullCoverage(TITLE_INFO_FIELDS);
  const presentCount = Object.values(coverage).filter(Boolean).length;
  const status = raw == null ? "fail" : presentCount < TITLE_INFO_FIELDS.length ? "partial" : "ok";
  const coverProbeStatus = await probeImage(raw?.cover as string | null | undefined, probeReferer);

  return { titleId, status, fieldCoverage: coverage, raw, error: null, coverProbeStatus };
}

async function auditSource(source: SourceConfig): Promise<SourceAuditResult> {
  const t0 = Date.now();

  const search = await auditSearch(source);
  const titles = search.top3.slice(0, 3);
  const queryWord = search.queriesAttempted.length === 1 ? "query" : "queries";
  LOGGER.audit(`Search: ${search.queriesAttempted.length} ${queryWord} -> ${search.top3.length} titles`);

  const searchStyle: SearchStyleAudit[] = [];
  const chaptersResults: ChaptersAudit[] = [];
  const pagesResults: PagesAudit[] = [];
  const titleInfoResults: TitleInfoAudit[] = [];
  const known = new Set(source.knownMissing ?? []);

  for (let idx = 0; idx < titles.length; idx++) {
    const title    = titles[idx];
    const titleNum = idx + 1;

    LOGGER.audit(`Title${titleNum}: "${title.title}"  cover:${fmtCover(title.cover, title.coverProbeStatus)}`);

    const style = await auditSearchStyle(source.id, title);
    searchStyle.push(style);
    LOGGER.audit(`Style: full:${fmtFound(style.fullTitle)}  word:${fmtFound(style.singleWord)}`);

    const chaps = await auditChapters(source.id, title.id, title.title);
    chaptersResults.push(chaps);
    const sample = chaps.first ?? chaps.last;
    if (sample?.chapterUpdatedAt && search.top3[idx]) {
      search.top3[idx] = { ...search.top3[idx], chapterUpdatedAt: sample.chapterUpdatedAt };
    }

    let firstPages: PagesAudit | undefined;
    let lastPages: PagesAudit | undefined;
    if (chaps.first) {
      firstPages = await auditPages(source.id, chaps.first.id!, "first-chapter", titleNum);
      pagesResults.push(firstPages);
      if (chaps.last && chaps.last.id !== chaps.first.id) {
        lastPages = await auditPages(source.id, chaps.last.id!, "last-chapter", titleNum);
        pagesResults.push(lastPages);
      }
    }

    LOGGER.audit(`Chapters: ${chaps.total}`);
    if (chaps.first) {
      LOGGER.audit(`First: ch${chaps.first.number}  ${firstPages?.total ?? 0}img  [first:${fmtImage(firstPages?.firstImage)}  last:${fmtImage(firstPages?.lastImage)}]`);
    }
    if (chaps.last && lastPages) {
      LOGGER.audit(`Last: ch${chaps.last.number}  ${lastPages.total}img  [first:${fmtImage(lastPages.firstImage)}  last:${fmtImage(lastPages.lastImage)}]`);
    }

    const titleInfo = await auditTitleInfo(source.id, title.id);
    titleInfoResults.push(titleInfo);
    const descTag           = fieldTag("desc", titleInfo.raw?.description != null, "OK", known.has("description"));
    const genresTag         = fieldTag("genres", Array.isArray(titleInfo.raw?.genres) && (titleInfo.raw.genres as unknown[]).length > 0, "OK", known.has("genres"));
    const typeTag           = fieldTag("type", titleInfo.raw?.type != null, String(titleInfo.raw?.type), known.has("type"));
    const altTag            = fieldTag("alt", titleInfo.raw?.alternativeTitle != null, "OK", known.has("alternativeTitle"));
    const seriesUpdatedTag  = fieldTag("seriesUpdatedAt", titleInfo.raw?.seriesUpdatedAt != null, "OK", known.has("seriesUpdatedAt"));
    const chapterUpdatedTag = fieldTag("chapterUpdatedAt", chaps.fieldCoverage.chapterUpdatedAt === true, "OK", known.has("chapterUpdatedAt"));
    LOGGER.audit(`Info: ${descTag}  ${genresTag}  ${typeTag}  ${altTag}  ${seriesUpdatedTag}  ${chapterUpdatedTag}`);
  }

  return {
    sourceId: source.id,
    baseUrl: source.baseUrl,
    method: source.method ?? "unknown",
    contentRating: source.contentRating ?? "sfw",
    color: source.color ?? "",
    auditedAt: new Date().toISOString(),
    durationMs: Date.now() - t0,
    search, searchStyle,
    chapters: chaptersResults,
    pages: pagesResults,
    titleInfo: titleInfoResults,
    knownMissing: source.knownMissing ?? [],
  };
}

async function runAudit(sourceId: string) {
  const allSources = loadSourcesFromFiles();

  const source = allSources.find(src => src.id === sourceId);

  if (!source) {
    LOGGER.error(`No source found with id="${sourceId}"`);
    process.exit(1);
  }

  probeReferer = source.imageReferer ?? source.baseUrl;
  const outPath = auditMdPath(sourceId);
  const auditFile: AuditFile = { runAt: new Date().toISOString(), apiBase: API_BASE, sources: [] };

  LOGGER.audit(`${source.id} (${source.language ?? "??"}) (${source.contentRating ?? "sfw"}) - ${source.baseUrl}`);
  const auditRecord = await auditSource(source);
  auditFile.sources.push(auditRecord);
  writeMarkdown(auditFile, outPath);
  LOGGER.audit(`Done in ${Math.round(auditRecord.durationMs / 1000)}s -> ${path.basename(outPath)}`);
}

function fmtImage(snap: PageSnapshot | null | undefined): string {
  if (!snap || !snap.imageUrl || snap.imageType === "empty") return paintBad("EMPTY");
  return snap.probeStatus === "fail" ? paintBad("FAIL") : paintOk("OK");
}

function fmtFound(outcome: { found: boolean; error: string | null }): string {
  if (outcome.error) return paintWarn("TIMEOUT");
  return outcome.found ? paintOk("YES") : paintBad("NO");
}

function fmtCover(cover: string | null | undefined, probe: CoverProbeStatus | null | undefined): string {
  if (!cover) return paintBad("MISSING");
  return probe === "fail" ? paintBad("FAIL") : paintOk("OK");
}

function loadSourcesFromFiles(): SourceConfig[] {
  if (!fs.existsSync(SOURCES_DIR)) {
    LOGGER.error(`Sources directory not found: ${SOURCES_DIR}`);
    process.exit(1);
  }
  return fs.readdirSync(SOURCES_DIR)
    .filter(fileName => fileName.endsWith(".json"))
    .map(fileName => {
      const raw = JSON.parse(fs.readFileSync(path.join(SOURCES_DIR, fileName), "utf-8")) as Partial<SourceConfig>;
      return {
        ...raw,
        id:         raw.id         ?? "",
        baseUrl:    raw.baseUrl    ?? "",
        method:     raw.method     ?? "html",
        urlFormat:  raw.urlFormat  ?? "slug",
        seriesUrl:  raw.seriesUrl  ?? "",
        chapterUrl: raw.chapterUrl ?? "",
        apiBase:    raw.apiBase    ?? "",
        enabled:    raw.enabled    ?? false,
      } as SourceConfig;
    })
    .filter(src => src.enabled !== false);
}

if (!process.env.VITEST) {
  const args = process.argv.slice(2);
  if (args[0] !== "--source" || !args[1]) {
    LOGGER.error("Usage: npx tsx script/sourcesAudit.ts --source <sourceId>");
    process.exit(1);
  }
  runAudit(args[1]).catch(err => { LOGGER.error("audit run failed", err); process.exit(1); });
}
