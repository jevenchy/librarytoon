import { KEYS, lsGet, lsSet } from "./storageKeys.js";

export type Bookmark = { sourceId: string; titleId: string; title: string; cover: string; bookmarkedAt: string };

function isBookmark(value: unknown): value is Bookmark {
  return (
    typeof value === "object" && value !== null &&
    typeof (value as Record<string, unknown>).sourceId === "string" &&
    typeof (value as Record<string, unknown>).titleId  === "string"
  );
}

export function readBookmarks(): Bookmark[] {
  try {
    const raw = lsGet(KEYS.bookmarks) ?? "[]";
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isBookmark);
  } catch {
    return [];
  }
}

export function writeBookmarks(bookmarks: Bookmark[]): void {
  lsSet(KEYS.bookmarks, JSON.stringify(bookmarks));
}
