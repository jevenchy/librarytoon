import { readFile, writeFile, readdir, unlink, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { SourceConfig } from "../../shared/types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SOURCES_DIR = path.join(__dirname, "../sources");

function migrate(c: Partial<SourceConfig>): SourceConfig {
  return {
    ...c,
    id:         c.id         ?? "",
    baseUrl:    c.baseUrl    ?? "",
    method:     c.method     ?? "html",
    urlFormat:  c.urlFormat  ?? "slug",
    seriesUrl:  c.seriesUrl  ?? "",
    chapterUrl: c.chapterUrl ?? "",
    apiBase:    c.apiBase    ?? "",
    enabled:    c.enabled    ?? true,
    createdAt:  c.createdAt  ?? new Date().toISOString(),
  } as SourceConfig;
}

async function ensureDir(): Promise<void> {
  await mkdir(SOURCES_DIR, { recursive: true });
}

function filePath(id: string): string {
  return path.join(SOURCES_DIR, `${id}.json`);
}

async function readOne(id: string): Promise<SourceConfig | null> {
  const fp = filePath(id);
  if (!existsSync(fp)) return null;
  try {
    const raw = await readFile(fp, "utf-8");
    return migrate(JSON.parse(raw) as Partial<SourceConfig>);
  } catch {
    return null;
  }
}

async function writeOne(config: SourceConfig): Promise<void> {
  await ensureDir();
  await writeFile(filePath(config.id), JSON.stringify(config, null, 2), "utf-8");
}

function sanitizeId(id: string): string {
  return id
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export async function listConfigs(): Promise<SourceConfig[]> {
  await ensureDir();
  let files: string[];
  try {
    files = await readdir(SOURCES_DIR);
  } catch {
    return [];
  }
  const configs: SourceConfig[] = [];
  for (const f of files) {
    if (!f.endsWith(".json")) continue;
    try {
      const raw = await readFile(path.join(SOURCES_DIR, f), "utf-8");
      configs.push(migrate(JSON.parse(raw) as Partial<SourceConfig>));
    } catch { /**/ }
  }
  return configs;
}

export async function getConfig(id: string): Promise<SourceConfig | null> {
  return readOne(id);
}

export async function createConfig(
  data: Omit<SourceConfig, "createdAt"> & { id: string }
): Promise<SourceConfig> {
  const id = sanitizeId(data.id);
  if (existsSync(filePath(id))) {
    throw new Error(`Source with id "${id}" already exists`);
  }
  const config: SourceConfig = { ...data, id, createdAt: new Date().toISOString() };
  await writeOne(config);
  return config;
}

export async function updateConfig(
  id: string,
  data: Partial<Omit<SourceConfig, "id" | "createdAt">>
): Promise<SourceConfig> {
  const existing = await readOne(id);
  if (!existing) throw new Error(`Source not found: ${id}`);
  const updated = { ...existing, ...data };
  await writeOne(updated);
  return updated;
}

export async function deleteConfig(id: string): Promise<void> {
  const fp = filePath(id);
  if (!existsSync(fp)) throw new Error(`Source not found: ${id}`);
  await unlink(fp);
}

export async function upsertConfig(
  id: string,
  data: Partial<Omit<SourceConfig, "id">>
): Promise<SourceConfig> {
  const existing = await readOne(id);
  if (existing) {
    const updated = { ...existing, ...data };
    await writeOne(updated);
    return updated;
  }
  const config: SourceConfig = {
    id,
    baseUrl: data.baseUrl ?? "",
    method: data.method ?? "html",
    urlFormat: data.urlFormat ?? "slug",
    seriesUrl: data.seriesUrl ?? "",
    chapterUrl: data.chapterUrl ?? "",
    apiBase: data.apiBase ?? "",
    enabled: data.enabled ?? true,
    createdAt: data.createdAt ?? new Date().toISOString(),
    ...data
  };
  await writeOne(config);
  return config;
}
