import axios, { AxiosError, type AxiosRequestConfig } from "axios";
import { LOGGER } from "../utils/logger.js";
import { DEFAULT_UA } from "../constants.js";
import { DOH_HTTP_AGENT, DOH_HTTPS_AGENT } from "./dohService.js";

const DEFAULT_TIMEOUT = 15000;
const DEFAULT_MAX_CONTENT = Number(process.env.FETCH_MAX_BYTES ?? 16 * 1024 * 1024);

function logSafeUrl(url: string): string {
  return url.length > 200 ? url.slice(0, 200) + "..." : url;
}

const MAX_CONCURRENT = Number(process.env.MAX_CONCURRENT ?? 8);
const RUNNING_MAP = new Map<string, number>();
const WAIT_QUEUES = new Map<string, Array<() => void>>();

const MAX_CONCURRENT_GLOBAL = Number(process.env.MAX_CONCURRENT_GLOBAL ?? 64);
const MAX_RETRY_AFTER_MS = 30_000;
let globalRunning = 0;
const GLOBAL_WAIT_QUEUE: Array<() => void> = [];

export function getConcurrencyStats(): { globalRunning: number; globalLimit: number; queued: number } {
  return { globalRunning, globalLimit: MAX_CONCURRENT_GLOBAL, queued: GLOBAL_WAIT_QUEUE.length };
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(timer);
      reject(new DOMException("Aborted", "AbortError"));
    }, { once: true });
  });
}

function acquireGlobalSlot(): Promise<void> {
  if (globalRunning < MAX_CONCURRENT_GLOBAL) {
    globalRunning++;
    return Promise.resolve();
  }
  return new Promise(resolve => { GLOBAL_WAIT_QUEUE.push(resolve); });
}

function releaseGlobalSlot(): void {
  const next = GLOBAL_WAIT_QUEUE.shift();
  if (next) {
    next();
  } else {
    globalRunning = Math.max(0, globalRunning - 1);
  }
}

function acquireSlot(sourceId?: string, limit = MAX_CONCURRENT): Promise<void> {
  const key = sourceId ?? "_global";
  const running = RUNNING_MAP.get(key) ?? 0;
  if (running < limit) {
    RUNNING_MAP.set(key, running + 1);
    return Promise.resolve();
  }
  return new Promise(resolve => {
    let queue = WAIT_QUEUES.get(key);
    if (!queue) {
      queue = [];
      WAIT_QUEUES.set(key, queue);
    }
    queue.push(resolve);
  });
}

function releaseSlot(sourceId?: string): void {
  const key = sourceId ?? "_global";
  const queue = WAIT_QUEUES.get(key);
  const next = queue?.shift();
  if (queue?.length === 0) WAIT_QUEUES.delete(key);
  if (next) {
    next();
  } else {
    const running = RUNNING_MAP.get(key) ?? 1;
    const newCount = Math.max(0, running - 1);
    if (newCount === 0) RUNNING_MAP.delete(key);
    else RUNNING_MAP.set(key, newCount);
  }
}

export type FetchOptions = AxiosRequestConfig & {
  retries?: number;
  retryDelayMs?: number;
  concurrencyLimit?: number;
  rateLimitCooldown?: number;
  retryOn?: number[];
  sourceId?: string;
};

export async function fetchText(url: string, opts: FetchOptions = {}): Promise<string> {
  return request<string>(url, { ...opts, responseType: "text" });
}

export async function fetchJson<T = unknown>(url: string, opts: FetchOptions = {}): Promise<T> {
  return request<T>(url, { ...opts, responseType: "json" });
}

async function request<T>(url: string, opts: FetchOptions): Promise<T> {
  const retries = opts.retries ?? 1;
  const delay = opts.retryDelayMs ?? 500;
  const sourceId = opts.sourceId;
  const limit = opts.concurrencyLimit ?? MAX_CONCURRENT;
  let lastError: unknown;

  // Acquire source slot before global slot so a saturated source does not hold global slots
  // while waiting, which would otherwise starve requests from other sources.
  await acquireSlot(sourceId, limit);
  await acquireGlobalSlot();
  try {
    for (let attempt = 0; attempt <= retries; attempt++) {
      if (opts.signal?.aborted) throw new DOMException("Aborted", "AbortError");
      try {
        const res = await axios.request<T>({
          url,
          method: opts.method ?? "GET",
          timeout: opts.timeout ?? DEFAULT_TIMEOUT,
          maxContentLength: opts.maxContentLength ?? DEFAULT_MAX_CONTENT,
          maxBodyLength: opts.maxBodyLength ?? DEFAULT_MAX_CONTENT,
          headers: { "User-Agent": DEFAULT_UA, Accept: "*/*", ...(opts.headers ?? {}) },
          params: opts.params,
          data: opts.data,
          responseType: opts.responseType,
          validateStatus: opts.validateStatus,
          signal: opts.signal,
          httpAgent:  DOH_HTTP_AGENT,
          httpsAgent: DOH_HTTPS_AGENT,
        });
        return res.data;
      } catch (err) {
        lastError = err;
        const axiosErr = err as AxiosError;
        if (axiosErr.code === "ERR_CANCELED") throw err;
        const status = axiosErr.response?.status;

        const isTimeout = axiosErr.code === "ETIMEDOUT" || axiosErr.code === "ECONNABORTED" || axiosErr.message?.toLowerCase().includes("timeout");
        const isCloudflareDown = status !== undefined && status >= 520 && status <= 527;
        const shouldRetry = !isCloudflareDown && (
          isTimeout ||
          (status !== undefined && (status >= 500 || status === 429 || (opts.retryOn?.includes(status) ?? false)))
        );

        if (!shouldRetry) {
          if (status === 404) {
            LOGGER.debug("fetch_404", { url: logSafeUrl(url), attempt });
          } else {
            LOGGER.warn("fetch_failed", { url: logSafeUrl(url), attempt, status, code: axiosErr.code });
          }
          throw err;
        }

        if (attempt < retries) {
          if (opts.signal?.aborted) throw new DOMException("Aborted", "AbortError");
          let cooldown = opts.retryDelayMs ?? delay * (attempt + 1);
          if (status === 429) {
            cooldown = opts.rateLimitCooldown ?? 5000;
            const retryAfter = axiosErr.response?.headers?.["retry-after"];
            if (retryAfter) {
              const parsed = parseInt(retryAfter, 10);
              // Cap the upstream-controlled value. An unbounded Retry-After could starve all outbound scraping.
              if (!isNaN(parsed)) cooldown = Math.min(parsed * 1000, MAX_RETRY_AFTER_MS);
            }
            LOGGER.warn("rate_limited", { url: logSafeUrl(url), cooldown });
          }
          await sleep(cooldown, opts.signal as AbortSignal | undefined);
        }
      }
    }
  } finally {
    releaseGlobalSlot();
    releaseSlot(sourceId);
  }
  throw lastError;
}
