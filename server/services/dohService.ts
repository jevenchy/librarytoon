import * as http  from "node:http";
import * as https from "node:https";
import * as dns   from "node:dns";
import axios      from "axios";
import { logger } from "../utils/logger.js";
import { listConfigs } from "./sourceConfigService.js";

// DoH providers: accessed via IP to avoid bootstrapping problem

const DOH_PROVIDERS = [
  // Cloudflare: IP 1.1.1.1, endpoint path /dns-query
  { url: "https://1.1.1.1/dns-query", label: "cloudflare" },
  // Google: IP 8.8.8.8, endpoint path /resolve
  { url: "https://8.8.8.8/resolve",   label: "google"     },
];

interface DohAnswer  { type: number; TTL: number; data: string; }
interface DohResponse { Status: number; Answer?: DohAnswer[]; }

const dohCache = new Map<string, { ips: string[]; expires: number }>();

// Dedicated axios instance for DoH: no custom agents, uses IPs directly
const dohAxios = axios.create({ timeout: 6000 });

async function resolveViaDoh(hostname: string, depth = 0): Promise<string[]> {
  // Pass-through raw IPs and localhost
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(hostname) || hostname === "localhost") {
    return [hostname];
  }

  // Guard against infinite CNAME loops
  if (depth > 5) return [];

  // Return cached result if still valid
  const hit = dohCache.get(hostname);
  if (hit && hit.expires > Date.now()) return hit.ips;

  for (const provider of DOH_PROVIDERS) {
    try {
      const res = await dohAxios.get<DohResponse>(provider.url, {
        params:  { name: hostname, type: "A" },
        headers: { Accept: "application/dns-json" },
      });

      const answers = res.data?.Answer ?? [];

      // Collect A records (type 1)
      const ips = answers
        .filter(a => a.type === 1)
        .map(a => a.data.trim())
        .filter(Boolean);

      if (ips.length > 0) {
        const ttl = Math.min(...answers.map(a => a.TTL), 300);
        dohCache.set(hostname, { ips, expires: Date.now() + ttl * 1000 });
        return ips;
      }

      // Follow CNAME chain if no A records returned directly
      const cname = answers.find(a => a.type === 5);
      if (cname) {
        const target = cname.data.replace(/\.$/, ""); // strip trailing dot
        const resolved = await resolveViaDoh(target, depth + 1);
        if (resolved.length > 0) {
          // Cache the alias with a short TTL since we don't have the real TTL
          dohCache.set(hostname, { ips: resolved, expires: Date.now() + 60_000 });
          return resolved;
        }
      }
    } catch (err: any) {
      logger.warn("doh_provider_failed", `[${provider.label}] ${hostname}: ${err.message}`);
    }
  }

  logger.warn("doh_fallback_system_dns", `Fallback to system DNS for ${hostname}`);
  return [];  // caller will fall back to system DNS
}

function dohLookup(
  hostname: string,
  options: any,
  callback: (err: NodeJS.ErrnoException | null, address: any, family?: number) => void
): void {
  resolveViaDoh(hostname)
    .then(ips => {
      if (ips.length > 0) {
        if (options?.all === true) {
          callback(null, ips.map(address => ({ address, family: 4 })));
        } else {
          callback(null, ips[0], 4);
        }
      } else {
        dns.lookup(hostname, options, callback as any);
      }
    })
    .catch(() => dns.lookup(hostname, options, callback as any));
}

export const dohHttpAgent  = new http.Agent({
  lookup: dohLookup as http.AgentOptions["lookup"],
  keepAlive: true,
});

export const dohHttpsAgent = new https.Agent({
  lookup: dohLookup as https.AgentOptions["lookup"],
  keepAlive: true,
});

function hostnameOf(url: string): string | null {
  try { return new URL(url).hostname; } catch { return null; }
}

export function getDohIpSnapshot(): Record<string, string> {
  const now = Date.now();
  const result: Record<string, string> = {};
  for (const [hostname, { ips, expires }] of dohCache) {
    if (expires > now && ips.length > 0) result[hostname] = ips[0];
  }
  return result;
}

export async function warmDnsCache(): Promise<void> {
  const configs = await listConfigs();
  const domains = new Set<string>();
  for (const cfg of configs) {
    const primary = hostnameOf(cfg.apiBase || cfg.baseUrl);
    if (primary) domains.add(primary);
  }
  await Promise.allSettled([...domains].map(d => resolveViaDoh(d)));
  if (domains.size > 0) {
    logger.doh(`All ${domains.size} sources resolved`);
  }
}

export function startDnsRefresh(intervalMs = 20 * 60 * 1000): void {
  setInterval(() => {
    warmDnsCache().catch(err =>
      logger.warn("doh_refresh_failed", `DNS refresh failed: ${(err as any).message}`)
    );
  }, intervalMs);
}
