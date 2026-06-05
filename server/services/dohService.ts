import * as http from "node:http";
import * as https from "node:https";
import * as dns from "node:dns";
import axios from "axios";
import { LRUCache } from "lru-cache";
import { LOGGER } from "../utils/logger.js";
import { isPrivateIp } from "../utils/ipUtils.js";
import { listConfigs } from "./sourceConfigService.js";

const DOH_PROVIDERS = [
  { url: "https://1.1.1.1/dns-query", label: "cloudflare" },
  { url: "https://8.8.8.8/resolve",   label: "google"     },
];

interface DohAnswer  { type: number; TTL: number; data: string; }
interface DohResponse { Status: number; Answer?: DohAnswer[]; }

const DOH_CACHE_MAX = Number(process.env.DOH_CACHE_MAX ?? 500);
const DOH_CACHE = new LRUCache<string, { ips: string[]; expires: number }>({ max: DOH_CACHE_MAX });
// Negative-cache failed resolutions briefly so a provider hiccup does not re-issue 6s-timeout queries.
const DOH_NEGATIVE_TTL_MS = Number(process.env.DOH_NEGATIVE_TTL_MS ?? 5_000);
let dohFailures = 0;
export function getDohFailures(): number { return dohFailures; }

// Fail closed: when both DoH providers fail, do not fall back to OS DNS (split-horizon SSRF risk).
const ALLOW_SYSTEM_DNS_FALLBACK = process.env.ALLOW_SYSTEM_DNS_FALLBACK === "true";

const DOH_AXIOS = axios.create({ timeout: 6000 });

function systemDnsLookup(
  hostname: string,
  options: { all?: boolean },
  callback: (err: NodeJS.ErrnoException | null, address: unknown, family?: number) => void
): void {
  if (!ALLOW_SYSTEM_DNS_FALLBACK) {
    const err = Object.assign(
      new Error(`DoH resolution failed for ${hostname}; system DNS fallback disabled`),
      { code: "EAI_AGAIN" }
    );
    callback(err as NodeJS.ErrnoException, null);
    return;
  }
  LOGGER.warn("doh_fallback_system_dns", `Fallback to system DNS for ${hostname}`);
  dns.lookup(hostname, options, (err, address, family) => {
    if (err) { callback(err, null); return; }
    const addr = String(address);
    if (isPrivateIp(addr)) {
      const ssrfErr = Object.assign(
        new Error(`SSRF blocked via system DNS fallback: ${hostname} -> ${addr}`),
        { code: "EACCES" }
      );
      callback(ssrfErr as NodeJS.ErrnoException, null);
      return;
    }
    callback(null, address, family);
  });
}

async function resolveViaDoh(hostname: string, depth = 0): Promise<string[]> {
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(hostname) || hostname === "localhost") {
    return [hostname];
  }
  if (depth > 5) return [];

  const hit = DOH_CACHE.get(hostname);
  if (hit && hit.expires > Date.now()) return hit.ips;

  async function queryProvider(provider: typeof DOH_PROVIDERS[number]): Promise<string[]> {
    const res = await DOH_AXIOS.get<DohResponse>(provider.url, {
      params:  { name: hostname, type: "A" },
      headers: { Accept: "application/dns-json" },
    });
    const answers = res.data?.Answer ?? [];
    const ips = answers.filter(answer => answer.type === 1).map(answer => answer.data.trim()).filter(Boolean);
    if (ips.length > 0) {
      const ttl = Math.min(...answers.map(answer => answer.TTL), 300);
      DOH_CACHE.set(hostname, { ips, expires: Date.now() + ttl * 1000 });
      return ips;
    }
    const cname = answers.find(answer => answer.type === 5);
    if (cname) {
      const target = cname.data.replace(/\.$/, "");
      const resolved = await resolveViaDoh(target, depth + 1);
      if (resolved.length > 0) {
        DOH_CACHE.set(hostname, { ips: resolved, expires: Date.now() + 60_000 });
        return resolved;
      }
    }
    throw new Error("no A records");
  }

  try {
    const ips = await Promise.any(DOH_PROVIDERS.map(provider => queryProvider(provider)));
    return ips;
  } catch {
    LOGGER.warn("doh_provider_failed", `All providers failed for ${hostname}`);
    dohFailures++;
  }

  DOH_CACHE.set(hostname, { ips: [], expires: Date.now() + DOH_NEGATIVE_TTL_MS });
  return [];
}

function dohLookup(
  hostname: string,
  options: { all?: boolean },
  callback: (err: NodeJS.ErrnoException | null, address: unknown, family?: number) => void
): void {
  resolveViaDoh(hostname)
    .then(ips => {
      const safe = ips.filter(ip => !isPrivateIp(ip));
      if (safe.length > 0) {
        if (options?.all === true) {
          callback(null, safe.map(address => ({ address, family: 4 })));
        } else {
          callback(null, safe[0], 4);
        }
      } else if (ips.length > 0 && safe.length === 0) {
        const err = Object.assign(new Error(`SSRF blocked: ${hostname} resolved to private IP`), { code: "EACCES" });
        callback(err as NodeJS.ErrnoException, null);
      } else {
        systemDnsLookup(hostname, options, callback);
      }
    })
    .catch(() => systemDnsLookup(hostname, options, callback));
}

export const DOH_HTTP_AGENT  = new http.Agent({
  lookup: dohLookup as http.AgentOptions["lookup"],
  keepAlive: true,
});

export const DOH_HTTPS_AGENT = new https.Agent({
  lookup: dohLookup as https.AgentOptions["lookup"],
  keepAlive: true,
});

function hostnameOf(url: string): string | null {
  try { return new URL(url).hostname; } catch { return null; }
}

export async function warmDnsCache(): Promise<void> {
  const configs = await listConfigs();
  const domains = new Set<string>();
  for (const cfg of configs) {
    if (!cfg.enabled) continue;
    const primary = hostnameOf(cfg.apiBase || cfg.baseUrl);
    if (primary) domains.add(primary);
    const cdn = hostnameOf(cfg.imageCdn ?? "");
    if (cdn) domains.add(cdn);
  }
  const domainList = [...domains];
  const DOH_WARM_BATCH = 10;
  for (let idx = 0; idx < domainList.length; idx += DOH_WARM_BATCH) {
    await Promise.allSettled(domainList.slice(idx, idx + DOH_WARM_BATCH).map(domain => resolveViaDoh(domain)));
  }
  if (domains.size > 0) {
    LOGGER.doh(`All ${domains.size} sources resolved`);
  }
}
