import { readFile, readdir, mkdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { SourceConfig } from "../../shared/types.js";
import { sourceConfigSchema } from "../../shared/schemas.js";
import { LOGGER } from "../utils/logger.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SOURCES_DIR = process.env.SOURCES_DIR ?? path.join(__dirname, "../sources");

export function migrate(cfg: Partial<SourceConfig>): SourceConfig {
  return {
    ...cfg,
    id:         cfg.id         ?? "",
    baseUrl:    cfg.baseUrl    ?? "",
    method:     cfg.method     ?? "html",
    urlFormat:  cfg.urlFormat  ?? "slug",
    seriesUrl:  cfg.seriesUrl  ?? "",
    chapterUrl: cfg.chapterUrl ?? "",
    apiBase:    cfg.apiBase    ?? "",
    // Require explicit opt-in. A config missing this field should not auto-activate.
    enabled:    cfg.enabled    ?? false,
    createdAt:  cfg.createdAt,
  } as SourceConfig;
}

function validateConfig(config: SourceConfig): SourceConfig {
  const parseResult = sourceConfigSchema.safeParse(config);
  if (!parseResult.success) {
    const issues = parseResult.error.issues.map(issue => `${issue.path.join(".")}: ${issue.message}`).join("; ");
    LOGGER.warn("source_config_invalid", { source: config.id, issues });
    return { ...config, enabled: false };
  }
  return config;
}

async function ensureDir(): Promise<void> {
  await mkdir(SOURCES_DIR, { recursive: true });
}

async function loadOneFile(file: string): Promise<SourceConfig | null> {
  try {
    const raw = await readFile(path.join(SOURCES_DIR, file), "utf-8");
    const parsed = JSON.parse(raw) as Partial<SourceConfig>;
    delete (parsed as Record<string, unknown>)["$schema"];
    return validateConfig(migrate(parsed));
  } catch {
    return null;
  }
}

const CONFIG_MAP = new Map<string, SourceConfig>();
const MTIME_MAP  = new Map<string, number>();
let configMapLoadedAt = 0;
let loadInFlight: Promise<SourceConfig[]> | null = null;
// Source configs only change on deploy. 5 minutes keeps reloads rare and a SIGUSR1 forces refresh.
const CONFIG_CACHE_TTL_MS = Number(process.env.CONFIG_CACHE_TTL_MS ?? 5 * 60_000);

export async function listConfigs(): Promise<SourceConfig[]> {
  const now = Date.now();
  if (configMapLoadedAt > 0 && now - configMapLoadedAt < CONFIG_CACHE_TTL_MS) {
    return [...CONFIG_MAP.values()];
  }
  if (loadInFlight) return loadInFlight;
  loadInFlight = (async () => {
    await ensureDir();
    let files: string[];
    try {
      files = await readdir(SOURCES_DIR);
    } catch {
      return [];
    }
    const knownIds = new Set(files.filter(file => file.endsWith(".json")).map(file => file.slice(0, -5)));
    for (const id of [...CONFIG_MAP.keys()]) {
      if (!knownIds.has(id)) {
        CONFIG_MAP.delete(id);
        MTIME_MAP.delete(id);
      }
    }
    const jsonFiles = files.filter(file => file.endsWith(".json"));

    const statResults = await Promise.allSettled(
      jsonFiles.map(async file => ({
        file,
        mtimeMs: (await stat(path.join(SOURCES_DIR, file))).mtimeMs,
      }))
    );

    const toLoad = statResults
      .filter((result): result is PromiseFulfilledResult<{ file: string; mtimeMs: number }> =>
        result.status === "fulfilled"
      )
      .map(result => result.value)
      .filter(({ file, mtimeMs }) => {
        const id = file.slice(0, -5);
        return !(CONFIG_MAP.has(id) && MTIME_MAP.get(id) === mtimeMs);
      });

    const loadResults = await Promise.allSettled(
      toLoad.map(async ({ file, mtimeMs }) => ({ file, mtimeMs, cfg: await loadOneFile(file) }))
    );

    for (const outcome of loadResults) {
      if (outcome.status === "rejected") continue;
      const { file, mtimeMs, cfg } = outcome.value;
      if (!cfg) continue;
      CONFIG_MAP.set(file.slice(0, -5), cfg);
      MTIME_MAP.set(file.slice(0, -5), mtimeMs);
    }
    configMapLoadedAt = Date.now();
    const configs = [...CONFIG_MAP.values()];
    const enabledCount = configs.filter(cfg => cfg.enabled).length;
    LOGGER.info(`${enabledCount} Sources reloaded`);
    if (configs.length === 0) {
      LOGGER.warn("source_config_empty", { dir: SOURCES_DIR, hint: "No .json source configs found. Set SOURCES_DIR env var or add configs to the sources/ directory." });
    }
    return configs;
  })().finally(() => { loadInFlight = null; });
  return loadInFlight;
}

export function invalidateConfigCache(): void {
  CONFIG_MAP.clear();
  MTIME_MAP.clear();
  configMapLoadedAt = 0;
}

export async function getSourceRegexPatterns(): Promise<{ pattern: string; flags: string; source: string }[]> {
  let files: string[];
  try { files = await readdir(SOURCES_DIR); } catch { return []; }
  const patterns: { pattern: string; flags: string; source: string }[] = [];
  for (const file of files.filter(fileEntry => fileEntry.endsWith(".json"))) {
    try {
      const raw = JSON.parse(await readFile(path.join(SOURCES_DIR, file), "utf-8")) as Record<string, unknown>;
      const numPat = raw.chapterNumberPattern as string | undefined;
      const imgPat = (raw.images as { urlPattern?: string } | undefined)?.urlPattern;
      if (numPat) patterns.push({ pattern: numPat, flags: "i", source: file });
      if (imgPat) patterns.push({ pattern: imgPat, flags: "",  source: file });
    } catch {}
  }
  return patterns;
}
