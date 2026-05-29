import axios, { AxiosError, type AxiosRequestConfig } from "axios";
import { logger } from "../utils/logger.js";
import { dohHttpAgent, dohHttpsAgent } from "./dohService.js";
import { isOpen, recordSuccess, recordFailure } from "./circuitBreaker.js";

const DEFAULT_TIMEOUT = 15000;
const DEFAULT_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";

const MAX_CONCURRENT = 8;
const runningMap = new Map<string, number>();
const waitQueues = new Map<string, Array<() => void>>();

function acquireSlot(sourceId?: string, limit = MAX_CONCURRENT): Promise<void> {
  const key = sourceId ?? "_global";
  const running = runningMap.get(key) ?? 0;
  if (running < limit) {
    runningMap.set(key, running + 1);
    return Promise.resolve();
  }
  return new Promise(resolve => {
    let q = waitQueues.get(key);
    if (!q) {
      q = [];
      waitQueues.set(key, q);
    }
    q.push(resolve);
  });
}

function releaseSlot(sourceId?: string): void {
  const key = sourceId ?? "_global";
  const q = waitQueues.get(key);
  const next = q?.shift();
  if (next) {
    next();
  } else {
    const running = runningMap.get(key) ?? 1;
    runningMap.set(key, Math.max(0, running - 1));
  }
}

export type FetchOptions = AxiosRequestConfig & {
  retries?: number;
  retryDelayMs?: number;
  concurrencyLimit?: number;
  rateLimitCooldown?: number;
  retryOn?: number[];
  sourceId?: string;
  /** Skip circuit-breaker recording for this request (use for search probes). */
  noCircuit?: boolean;
};

export async function fetchText(url: string, opts: FetchOptions = {}): Promise<string> {
  return request<string>(url, { ...opts, responseType: "text" });
}

export async function fetchJson<T = unknown>(url: string, opts: FetchOptions = {}): Promise<T> {
  return request<T>(url, { ...opts, responseType: "json" });
}

function circuitKey(url: string, sourceId?: string): string {
  if (sourceId) return sourceId;
  try { return new URL(url).hostname; } catch { return url; }
}

async function request<T>(url: string, opts: FetchOptions): Promise<T> {
  const retries = opts.retries ?? 2;
  const delay = opts.retryDelayMs ?? 500;
  const sourceId = opts.sourceId;
  const limit = opts.concurrencyLimit ?? MAX_CONCURRENT;
  const ck = circuitKey(url, sourceId);
  let lastError: unknown;

  if (isOpen(ck)) {
    throw new Error(`circuit_open: ${ck}`);
  }

  await acquireSlot(sourceId, limit);
  try {
    // Re-check after acquiring slot — circuit may have opened while queued
    if (isOpen(ck)) throw new Error(`circuit_open: ${ck}`);

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const res = await axios.request<T>({
          url,
          method: opts.method ?? "GET",
          timeout: opts.timeout ?? DEFAULT_TIMEOUT,
          headers: { "User-Agent": DEFAULT_UA, Accept: "*/*", ...(opts.headers ?? {}) },
          params: opts.params,
          data: opts.data,
          responseType: opts.responseType,
          // Use DoH agents so all requests bypass ISP DNS blocking
          httpAgent:  dohHttpAgent,
          httpsAgent: dohHttpsAgent,
        });
        recordSuccess(ck);
        return res.data;
      } catch (err) {
        lastError = err;
        const e = err as AxiosError;
        const status = e.response?.status;

        const isTimeout = e.code === "ETIMEDOUT" || e.code === "ECONNABORTED" || e.message?.toLowerCase().includes("timeout");
        // 520–527 = Cloudflare origin-unreachable errors; retrying is pointless
        const isCloudflareDown = status !== undefined && status >= 520 && status <= 527;
        const shouldRetryStatus = !isCloudflareDown && (status !== undefined) && (
          (status >= 500 && status < 600) ||
          (status === 429) ||
          (opts.retryOn?.includes(status))
        );
        const shouldRetry = shouldRetryStatus || isTimeout;

        // If it's a 4xx (non-429), or a Cloudflare down error, fail fast — no retry
        if (status !== undefined && ((status >= 400 && status < 500 && !shouldRetryStatus) || isCloudflareDown)) {
          // Probe requests (noCircuit) and plain 404s are expected — don't pollute logs
          if (!opts.noCircuit && status !== 404) logger.warn("fetch_failed", { url, attempt, status, code: e.code });
          // 403 & 520-527 are unambiguous source-wide blocks — open circuit immediately
          const isHardBlock = isCloudflareDown || status === 403;
          if (isHardBlock && !opts.noCircuit && recordFailure(ck, true)) {
            logger.warn("circuit_open", { source: ck, status, ttlMs: 60_000 });
          }
          throw err;
        }

        // If it's a non-timeout network failure, fail fast
        const isNonTimeoutNetworkFailure = (e.code === "ECONNREFUSED" || e.code === "ECONNRESET" || e.code === "ENOTFOUND") && !isTimeout;
        logger.warn("fetch_failed", { url, attempt, status, code: e.code });
        if (isNonTimeoutNetworkFailure) {
          if (!opts.noCircuit && recordFailure(ck)) {
            logger.warn("circuit_open", { source: ck, code: e.code, ttlMs: 60_000 });
          }
          throw err;
        }

        let cooldown = 0;
        if (status === 429) {
          cooldown = opts.rateLimitCooldown ?? 5000;
          const retryAfterHeader = e.response?.headers?.["retry-after"];
          if (retryAfterHeader) {
            const parsed = parseInt(retryAfterHeader, 10);
            if (!isNaN(parsed)) cooldown = parsed * 1000;
          }
          logger.warn("rate_limited", { url, cooldown });
        }

        if (attempt < retries) {
          const delayTime = status === 429
            ? cooldown
            : (opts.retryDelayMs ?? (delay * (attempt + 1)));
          await new Promise((r) => setTimeout(r, delayTime));
        }
      }
    }
  } finally {
    releaseSlot(sourceId);
  }
  throw lastError;
}
