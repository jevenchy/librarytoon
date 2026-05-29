import axios from "axios";
import { dohHttpAgent, dohHttpsAgent, getDohIpSnapshot } from "./dohService.js";
import { listConfigs } from "./sourceConfigService.js";
import { getOpenCircuits } from "./circuitBreaker.js";
import { logger } from "../utils/logger.js";
import type { HealthSnapshot, SourceHealth } from "../../shared/types.js";

const INTERVAL_MS   = 5 * 60 * 1000; // 5 minutes
const PING_TIMEOUT  = 8_000;
const UA            = "Mozilla/5.0 (compatible; librarytoon-health/1.0)";

const healthMap = new Map<string, SourceHealth>();

export function getHealthSnapshot(): HealthSnapshot {
  return {
    sources:     Object.fromEntries(healthMap),
    doh:         getDohIpSnapshot(),
    intervalMs:  INTERVAL_MS,
    circuitOpen: getOpenCircuits(),
  };
}

async function pingUrl(url: string): Promise<number | null> {
  const start = Date.now();
  try {
    await axios.request({
      method:         "HEAD",
      url,
      timeout:        PING_TIMEOUT,
      httpAgent:      dohHttpAgent,
      httpsAgent:     dohHttpsAgent,
      validateStatus: () => true, // any HTTP response = reachable
      headers:        { "User-Agent": UA },
    });
    return Date.now() - start;
  } catch {
    return null;
  }
}

async function runHealthCheck(): Promise<void> {
  const configs = await listConfigs();
  const targets  = configs.filter(c => c.enabled);
  if (targets.length === 0) return;

  const checkStartedAt = Date.now();
  const nextCheckAt    = checkStartedAt + INTERVAL_MS;

  await Promise.allSettled(
    targets.map(async cfg => {
      const url = cfg.apiBase || cfg.baseUrl;
      const ms  = await pingUrl(url);
      const status: SourceHealth["status"] =
        ms === null ? "error"
        : ms < 800  ? "ok"
        : ms < 2500 ? "slow"
        : "error";
      healthMap.set(cfg.id, { ms, status, checkedAt: checkStartedAt, nextCheckAt });
    })
  );

  const ok  = [...healthMap.values()].filter(h => h.checkedAt === checkStartedAt && h.status !== "error").length;
  logger.health(`${ok}/${targets.length} sources reachable`);
}

export function startHealthCheck(): void {
  runHealthCheck().catch(err =>
    logger.warn("health_check_failed", `Initial check: ${(err as Error).message}`)
  );
  setInterval(() => {
    runHealthCheck().catch(err =>
      logger.warn("health_check_failed", `Periodic check: ${(err as Error).message}`)
    );
  }, INTERVAL_MS);
}
