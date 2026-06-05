import { LRUCache } from "lru-cache";
import {
  CACHE_TTL_MS,
  EMPTY_SEARCH_TTL_MS,
  META_CACHE_TTL_MS,
} from "../constants.js";

const DEFAULT_MAX_ENTRIES = 2000;

const GLOBAL_MAX_BYTES = Number(process.env.CACHE_MAX_BYTES ?? 64 * 1024 * 1024);
const MAX_BYTES_BY_NAMESPACE: Record<string, number> = {
  search:         Math.floor(GLOBAL_MAX_BYTES * 0.25),
  chapters:       Math.floor(GLOBAL_MAX_BYTES * 0.5),
  pages:          Math.floor(GLOBAL_MAX_BYTES * 0.25),
  chaptersEmpty:  Math.floor(GLOBAL_MAX_BYTES * 0.05),
  pagesEmpty:     Math.floor(GLOBAL_MAX_BYTES * 0.05),
};
const DEFAULT_MAX_BYTES = Math.floor(GLOBAL_MAX_BYTES * 0.25);

const EMPTY_CHAPTERS_TTL_MS = 60_000;
const EMPTY_PAGES_TTL_MS    = 60_000;

// TTL is fixed per namespace. Passing ttl as a call-time argument is misleading
// because LRUCache locks the TTL at store creation. Define it here instead.
const NAMESPACE_TTL: Record<string, number> = {
  search:         CACHE_TTL_MS.search,
  searchEmpty:    EMPTY_SEARCH_TTL_MS,
  chapters:       CACHE_TTL_MS.chapters,
  chaptersEmpty:  EMPTY_CHAPTERS_TTL_MS,
  pages:          CACHE_TTL_MS.pages,
  pagesEmpty:     EMPTY_PAGES_TTL_MS,
  meta:           META_CACHE_TTL_MS,
};

const MAX_ENTRIES_BY_NAMESPACE: Record<string, number> = {
  chapters: 1000,
};

const STORES = new Map<string, LRUCache<string, NonNullable<unknown>>>();

type InflightEntry<T> = { promise: Promise<T>; cancel: AbortController; waiters: number };
const SINGLEFLIGHT = new Map<string, InflightEntry<unknown>>();

// Sliding 60-second window stats. Each bucket covers one second.
const WINDOW_SECONDS = 60;
const HIT_BUCKETS  = new Array<number>(WINDOW_SECONDS).fill(0);
const MISS_BUCKETS = new Array<number>(WINDOW_SECONDS).fill(0);
let lastBucketSecond = Math.floor(Date.now() / 1000);

function tickBuckets() {
  const nowSecond = Math.floor(Date.now() / 1000);
  const elapsed = nowSecond - lastBucketSecond;
  if (elapsed <= 0) return;
  const slots = Math.min(elapsed, WINDOW_SECONDS);
  for (let idx = 0; idx < slots; idx++) {
    const bucket = (lastBucketSecond + 1 + idx) % WINDOW_SECONDS;
    HIT_BUCKETS[bucket]  = 0;
    MISS_BUCKETS[bucket] = 0;
  }
  lastBucketSecond = nowSecond;
}

function recordHit() {
  tickBuckets();
  HIT_BUCKETS[lastBucketSecond % WINDOW_SECONDS]++;
}

function recordMiss() {
  tickBuckets();
  MISS_BUCKETS[lastBucketSecond % WINDOW_SECONDS]++;
}

// Coalesces concurrent calls for the same key into one in-flight promise.
// The underlying request is cancelled only when every active waiter has aborted its signal.
export function singleFlight<T>(
  key: string,
  fn: (signal: AbortSignal) => Promise<T>,
  signal?: AbortSignal,
): Promise<T> {
  let entry = SINGLEFLIGHT.get(key) as InflightEntry<T> | undefined;

  if (!entry) {
    const cancel = new AbortController();
    const promise = fn(cancel.signal).finally(() => SINGLEFLIGHT.delete(key));
    entry = { promise, cancel, waiters: 0 };
    SINGLEFLIGHT.set(key, entry as InflightEntry<unknown>);
  }

  entry.waiters++;
  const capturedEntry = entry;

  if (signal) {
    const onAbort = () => {
      capturedEntry.waiters--;
      if (capturedEntry.waiters <= 0) capturedEntry.cancel.abort();
    };
    signal.addEventListener("abort", onAbort, { once: true });
    capturedEntry.promise.finally(() => signal.removeEventListener("abort", onAbort));
  }

  return capturedEntry.promise;
}

function approxSize(value: unknown): number {
  try {
    const str = JSON.stringify(value);
    return Buffer.byteLength(str, "utf8") || 1;
  } catch { return 1; }
}

function getStore(namespace: string): LRUCache<string, NonNullable<unknown>> {
  let store = STORES.get(namespace);
  if (!store) {
    const ttl = NAMESPACE_TTL[namespace] ?? CACHE_TTL_MS.search;
    store = new LRUCache<string, NonNullable<unknown>>({
      max:             MAX_ENTRIES_BY_NAMESPACE[namespace] ?? DEFAULT_MAX_ENTRIES,
      maxSize:         MAX_BYTES_BY_NAMESPACE[namespace]   ?? DEFAULT_MAX_BYTES,
      sizeCalculation: approxSize,
      ttl,
    });
    STORES.set(namespace, store);
  }
  return store;
}

export const CACHE = {
  get<T>(namespace: string, key: string): T | undefined {
    const value = getStore(namespace).get(key) as T | undefined;
    if (value === undefined) recordMiss(); else recordHit();
    return value;
  },
  set<T>(namespace: string, key: string, value: T): void {
    getStore(namespace).set(key, value as NonNullable<unknown>);
  },
  stats(): { hits: number; misses: number } {
    tickBuckets();
    const hits   = HIT_BUCKETS.reduce((acc, val) => acc + val, 0);
    const misses = MISS_BUCKETS.reduce((acc, val) => acc + val, 0);
    return { hits, misses };
  }
};
