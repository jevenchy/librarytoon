import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { CoverProbeStatus } from "./sourcesAudit.js";
import type {
  SearchFieldKey,
  SearchResultSnapshot,
  SearchStyleAudit,
  TitleInfoAudit,
  SourceAuditResult,
  AuditFile,
  PageSnapshot,
  ChapterSnapshot,
  PagesAudit,
} from "./sourcesAudit.js";
import { SEARCH_FIELDS, EXPECTED_CONTENT_FIELDS, TITLE_INFO_FIELDS } from "./sourcesAudit.js";

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));

export function auditMdPath(sourceId: string): string {
  return path.join(TEST_DIR, `${sourceId}.audit.md`);
}

function fmtPageType(snap: PageSnapshot): string {
  if (snap.imageType === "proxied") {
    if (snap.probeStatus === "ok")   return "PROXIED, loaded";
    if (snap.probeStatus === "fail") return "PROXIED, not loaded";
    return "PROXIED";
  }
  if (snap.imageType === "direct") {
    if (snap.probeStatus === "ok")   return "DIRECT, loaded";
    if (snap.probeStatus === "fail") return "DIRECT, not loaded";
    return "DIRECT";
  }
  return "EMPTY";
}

function fmtCoverCell(cover: string | null | undefined, probe?: CoverProbeStatus | null): string {
  if (!cover) return "MISSING";
  if (cover.startsWith("/api/img")) {
    if (probe === "ok")   return "OK (PROXIED, loaded)";
    if (probe === "fail") return "FAIL (PROXIED, not loaded)";
    return "OK (PROXIED)";
  }
  if (probe === "ok")   return "OK (DIRECT, loaded)";
  if (probe === "fail") return "FAIL (DIRECT, not loaded)";
  return "OK (DIRECT)";
}

function decodeImageUrl(url: string): string {
  if (url.startsWith("/api/img?url=")) {
    try { return "/api/img?url=" + decodeURIComponent(url.slice("/api/img?url=".length)); }
    catch { return url; }
  }
  return url;
}

function missingLabel(key: string, known: Set<string>): string {
  return known.has(key) ? "N/A" : "MISSING";
}

function fmtSearchCell(key: SearchFieldKey, snap: SearchResultSnapshot, known: Set<string>): string {
  switch (key) {
    case "cover":            return fmtCoverCell(snap.cover, snap.coverProbeStatus);
    case "description":      return snap.description      != null ? "OK" : missingLabel(key, known);
    case "genres":           return snap.genres            != null ? "OK" : missingLabel(key, known);
    case "seriesUpdatedAt":  return snap.seriesUpdatedAt  != null ? "OK" : missingLabel(key, known);
    case "chapterUpdatedAt": return snap.chapterUpdatedAt != null ? "OK" : missingLabel(key, known);
    case "alternativeTitle": return snap.alternativeTitle  != null ? "OK" : missingLabel(key, known);
    default: {
      const fieldValue = (snap as Record<string, unknown>)[key];
      return fieldValue != null && fieldValue !== "" ? String(fieldValue) : missingLabel(key, known);
    }
  }
}

function searchTableMd(top3: SearchResultSnapshot[], known: Set<string>): string[] {
  const cols = top3.map((_slot, idx) => `Title ${idx + 1}`);
  const sep  = "|---|" + "---|".repeat(cols.length);
  return [
    `| Field | ${cols.join(" | ")} |`,
    sep,
    ...SEARCH_FIELDS.map(fieldKey => `| ${fieldKey} | ${top3.map(snap => fmtSearchCell(fieldKey, snap, known)).join(" | ")} |`),
  ];
}

function searchStyleMd(styles: SearchStyleAudit[]): string[] {
  if (styles.length === 0) return [];
  const cell = (outcome: { count: number; found: boolean; error: string | null }) =>
    outcome.error ? "TIMEOUT" : outcome.found ? "YES" : "NO";
  const lines: string[] = [
    "### Search Style Test",
    "| Title | Full Found? | Single Found? |",
    "|---|---|---|",
  ];
  for (const style of styles) {
    lines.push(`| ${style.titleName} | ${cell(style.fullTitle)} | ${cell(style.singleWord)} |`);
  }
  return lines;
}

function titleInfoMd(titleInfo: TitleInfoAudit, known: Set<string>, chapterUpdatedAtPresent: boolean): string[] {
  if (!titleInfo.raw) return ["- _No data_"];
  const raw = titleInfo.raw;
  const lines: string[] = [];
  lines.push(`- description: ${raw.description != null ? "OK" : missingLabel("description", known)}`);
  lines.push(
    Array.isArray(raw.genres) && (raw.genres as unknown[]).length > 0
      ? `- genres: ${(raw.genres as string[]).join(", ")}`
      : `- genres: ${missingLabel("genres", known)}`,
  );
  lines.push(`- type: ${raw.type ?? missingLabel("type", known)}`);
  if (raw.alternativeTitle) {
    const alt = String(raw.alternativeTitle);
    lines.push(`- alternativeTitle: OK (${alt.length > 80 ? alt.slice(0, 80) + "..." : alt})`);
  } else {
    lines.push(`- alternativeTitle: ${missingLabel("alternativeTitle", known)}`);
  }
  lines.push(`- seriesUpdatedAt: ${raw.seriesUpdatedAt != null ? "OK" : missingLabel("seriesUpdatedAt", known)}`);
  lines.push(`- chapterUpdatedAt: ${chapterUpdatedAtPresent ? "OK" : missingLabel("chapterUpdatedAt", known)}`);
  lines.push(`- cover: ${fmtCoverCell(raw.cover as string | null | undefined, titleInfo.coverProbeStatus)}`);
  return lines;
}

function autoIssuesMd(auditResult: SourceAuditResult): string[] {
  const issues: string[] = [];
  const known = new Set(auditResult.knownMissing);
  const expectedContent = EXPECTED_CONTENT_FIELDS[auditResult.method] ?? [];

  const missingExpected = expectedContent.filter(fieldKey => !auditResult.search.fieldCoverage[fieldKey] && !known.has(fieldKey));
  if (missingExpected.length > 0)
    issues.push(`Search results missing: ${missingExpected.map(fieldKey => `\`${fieldKey}\``).join(", ")}`);

  if (auditResult.search.status === "fail")
    issues.push(`Search non-functional: ${auditResult.search.error ?? "unknown reason"}`);

  for (const styleAudit of auditResult.searchStyle) {
    if (styleAudit.fullTitle.error) {
      issues.push(`Full-title search timed out for "${styleAudit.titleName}"`);
    } else if (!styleAudit.fullTitle.found) {
      issues.push(`Full-title search does not surface "${styleAudit.titleName}" - search matching issue (e.g. punctuation/apostrophe)`);
    }
    if (styleAudit.singleWord.error) {
      issues.push(`Single-word query "${styleAudit.singleWord.query}" caused timeout for "${styleAudit.titleName}" - enforce minimum query length >= 4 chars client-side`);
    } else if (!styleAudit.singleWord.found) {
      issues.push(`Single-word query "${styleAudit.singleWord.query}" doesn't surface "${styleAudit.titleName}" - search ranking or min-length issue`);
    }
  }

  for (const chap of auditResult.chapters) {
    if (!chap.fieldCoverage.chapterUpdatedAt && !known.has("chapterUpdatedAt"))
      issues.push(`Chapter \`chapterUpdatedAt\` missing for "${chap.titleName}" - fix field mapping in chapter list parser`);
    if (chap.status === "partial") issues.push(`Chapter list partial for "${chap.titleName}": ${chap.error ?? "partial=true from server"}`);
    if (chap.status === "fail")    issues.push(`Chapter list failed for "${chap.titleName}": ${chap.error ?? "unknown"}`);
  }

  for (const snap of auditResult.search.top3) {
    if (snap.coverProbeStatus === "fail")
      issues.push(`Cover not loadable for "${snap.title}" - proxy returned error (CDN redirect or hotlink block)`);
  }

  let flaggedDirect = false;
  for (const pageAudit of auditResult.pages) {
    if (pageAudit.status === "fail") issues.push(`Pages failed for chapter ${pageAudit.chapterId}: ${pageAudit.error ?? "unknown"}`);
    if (!flaggedDirect && pageAudit.firstImage?.imageType === "direct") {
      issues.push("Pages are direct (not proxied) - hotlink protection may fail in some clients");
      flaggedDirect = true;
    }
    if (pageAudit.firstImage?.probeStatus === "fail")
      issues.push(`Page image not loadable in ${pageAudit.label} (${pageAudit.chapterId}) - proxy returned error`);
    else if (pageAudit.lastImage?.probeStatus === "fail")
      issues.push(`Page last image not loadable in ${pageAudit.label} (${pageAudit.chapterId}) - proxy returned error`);
  }

  for (const titleInfo of auditResult.titleInfo) {
    const missingFields = TITLE_INFO_FIELDS.filter(fieldKey => !titleInfo.fieldCoverage[fieldKey] && !known.has(fieldKey));
    if (missingFields.length > 0)
      issues.push(`Title-info "${titleInfo.titleId}" missing: ${missingFields.map(fieldKey => `\`${fieldKey}\``).join(", ")}`);
    if (titleInfo.coverProbeStatus === "fail")
      issues.push(`Title-info cover not loadable for "${titleInfo.titleId}" - proxy returned error`);
  }

  return issues;
}

function summaryTableMd(sources: SourceAuditResult[]): string[] {
  const lines: string[] = [
    "## Summary Table", "",
    "| Source | Search | Chapters | Pages | Title-Info | Notes |",
    "|---|---|---|---|---|---|",
  ];

  for (const auditResult of sources) {
    const chapStatus = auditResult.chapters.length === 0 ? "N/A"
      : auditResult.chapters.every(chap => chap.status === "ok") ? "OK"
      : auditResult.chapters.some(chap => chap.status === "fail") ? "FAIL" : "PARTIAL";

    const pageStatus = auditResult.pages.length === 0 ? "N/A"
      : auditResult.pages.every(pageAudit => pageAudit.status === "ok") ? "OK"
      : auditResult.pages.some(pageAudit => pageAudit.status === "fail") ? "FAIL" : "PARTIAL";

    const known = new Set(auditResult.knownMissing);
    const expectedContent = EXPECTED_CONTENT_FIELDS[auditResult.method] ?? [];
    const leanSearch = expectedContent.some(fieldKey => !auditResult.search.fieldCoverage[fieldKey] && !known.has(fieldKey));
    const effectiveSearch = auditResult.search.status === "fail" ? "FAIL"
      : (auditResult.search.status === "partial" || leanSearch) ? "PARTIAL" : "OK";

    const titleInfoStatus = auditResult.titleInfo.length === 0 ? "N/A"
      : auditResult.titleInfo.some(titleInfo => titleInfo.status === "fail") ? "FAIL"
      : auditResult.titleInfo.some(titleInfo => TITLE_INFO_FIELDS.some(fieldKey => !titleInfo.fieldCoverage[fieldKey] && !known.has(fieldKey))) ? "PARTIAL"
      : "OK";

    const notes: string[] = [];
    if (auditResult.search.status === "fail") notes.push("search broken");
    if (auditResult.chapters.some(chap => !chap.fieldCoverage.chapterUpdatedAt) && !known.has("chapterUpdatedAt"))
      notes.push("chapters missing chapterUpdatedAt");

    const noteCell = notes.length > 0 ? notes.slice(0, 2).join("; ") : "OK";
    lines.push(`| ${auditResult.sourceId} | ${effectiveSearch} | ${chapStatus} | ${pageStatus} | ${titleInfoStatus} | ${noteCell} |`);
  }

  lines.push("", "");
  return lines;
}

function sourceMdBlock(auditResult: SourceAuditResult): string[] {
  const lines: string[] = [];
  const known = new Set(auditResult.knownMissing);

  lines.push(`## ${auditResult.sourceId} - ${auditResult.baseUrl}`);
  lines.push(`**Method:** ${auditResult.method} | **Rating:** ${auditResult.contentRating} | **Color:** ${auditResult.color}`);
  lines.push("");

  lines.push("### Search Results");
  lines.push(`Queries used: ${auditResult.search.queriesAttempted.map(queryStr => `"${queryStr}"`).join(", ")}`);
  lines.push("");

  if (auditResult.search.top3.length > 0) {
    lines.push(...searchTableMd(auditResult.search.top3, known));
  } else {
    lines.push(`_Search failed - ${auditResult.search.error ?? "no results"}_`);
  }
  lines.push("");

  if (auditResult.searchStyle.length > 0) { lines.push(...searchStyleMd(auditResult.searchStyle)); lines.push(""); }

  const titleCount = Math.max(auditResult.chapters.length, auditResult.titleInfo.length);
  for (let idx = 0; idx < titleCount; idx++) {
    const chapterAudit  = auditResult.chapters[idx];
    const titleInfo = auditResult.titleInfo[idx];
    const titleName = chapterAudit?.titleName ?? titleInfo?.titleId ?? `Title ${idx + 1}`;
    lines.push(`### Title ${idx + 1}: "${titleName}"`);
    lines.push("");

    lines.push("#### Title-Info");
    if (titleInfo) { lines.push(...titleInfoMd(titleInfo, known, chapterAudit?.fieldCoverage.chapterUpdatedAt === true)); }
    else     { lines.push("- N/A"); }
    lines.push("");

    const titlePages = auditResult.pages.filter(pageAudit => pageAudit.titleIndex === idx + 1);
    const chapterBlock = (label: string, snap: ChapterSnapshot, pages: PagesAudit | undefined) => {
      lines.push(`- **${label}**`);
      const imageCount = pages ? ` - ${pages.total} Images` : "";
      lines.push(`  - Info: number=${snap.number} title="${snap.title}" chapterUpdatedAt=${snap.chapterUpdatedAt ?? missingLabel("chapterUpdatedAt", known)}${imageCount}`);
      lines.push(`  - URL: id=${snap.id}`);
      if (pages?.firstImage?.imageUrl) lines.push(`  - First Image URL: \`${decodeImageUrl(pages.firstImage.imageUrl)}\` (${fmtPageType(pages.firstImage)})`);
      if (pages?.lastImage?.imageUrl)  lines.push(`  - Last Image URL: \`${decodeImageUrl(pages.lastImage.imageUrl)}\` (${fmtPageType(pages.lastImage)})`);
    };

    lines.push("#### Chapters");
    if (!chapterAudit) {
      lines.push("- N/A");
    } else if (chapterAudit.status === "fail" && chapterAudit.total === 0) {
      lines.push("- Total: 0 (partial=true)");
      if (chapterAudit.error) lines.push(`- Note: ${chapterAudit.error}`);
    } else {
      lines.push(`- Total: ${chapterAudit.total}`);
      if (chapterAudit.first) chapterBlock("First Chapter", chapterAudit.first, titlePages.find(pageAudit => pageAudit.label === "first-chapter"));
      if (chapterAudit.last)  chapterBlock("Last Chapter", chapterAudit.last, titlePages.find(pageAudit => pageAudit.label === "last-chapter"));
    }
    lines.push("");
  }

  lines.push("### Issues & Recommendations");
  const issues = autoIssuesMd(auditResult);
  for (const issue of issues) lines.push(`- ${issue}`);
  if (issues.length === 0) lines.push("- No major issues detected");
  lines.push("");

  return lines;
}

export function generateMarkdown(data: AuditFile): string {
  return [
    "# Source Audit Report",
    `Date: ${data.runAt.slice(0, 10)}`,
    "",
    ...data.sources.flatMap(sourceMdBlock),
    ...summaryTableMd(data.sources),
  ].join("\n");
}

export function writeMarkdown(data: AuditFile, outPath: string) {
  fs.writeFileSync(outPath, generateMarkdown(data), "utf-8");
}
