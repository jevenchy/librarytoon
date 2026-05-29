import { logger } from "../utils/logger.js";
import type { SourceAdapter } from "./types.js";
import { createConfigurableAdapter } from "./configurable/index.js";
import { listConfigs } from "../services/sourceConfigService.js";

const registry = new Map<string, SourceAdapter>();

export function registerAdapter(adapter: SourceAdapter): void {
  if (registry.has(adapter.info.id)) logger.warn("adapter_overwrite", { id: adapter.info.id });
  registry.set(adapter.info.id, adapter);
}

export function unregisterAdapter(id: string): void {
  registry.delete(id);
}

export function getAdapter(id: string): SourceAdapter {
  const adapter = registry.get(id);
  if (!adapter) throw new Error(`Unknown source: ${id}`);
  if (!adapter.info.enabled) throw new Error(`Source disabled: ${id}`);
  return adapter;
}

export function listAdapters() {
  return Array.from(registry.values()).map((a) => a.info);
}

/** Returns all enabled adapter instances (for global search) */
export function listAdapterInstances(): SourceAdapter[] {
  return Array.from(registry.values()).filter((a) => a.info.enabled);
}

/** (Re)load all configurable source configs from disk into the registry. */
export async function loadConfigurableAdapters(): Promise<void> {
  const configs = await listConfigs();

  registry.clear();

  for (const cfg of configs) {
    if (cfg.enabled) {
      registerAdapter(createConfigurableAdapter(cfg));
    }
  }
}

// Load configurable adapters (async, errors are non-fatal)
loadConfigurableAdapters().catch((e) =>
  logger.warn("configurable_adapters_load_failed", { error: String(e) })
);
