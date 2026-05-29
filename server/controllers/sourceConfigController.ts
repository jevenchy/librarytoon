import type { Request, Response } from "express";
import {
  listConfigs,
  getConfig,
  createConfig,
  updateConfig,
  deleteConfig
} from "../services/sourceConfigService.js";
import {
  loadConfigurableAdapters,
  registerAdapter,
  unregisterAdapter
} from "../adapters/index.js";
import { createConfigurableAdapter } from "../adapters/configurable/index.js";
import type { SourceConfig } from "../../shared/types.js";

/** @types/express@5 types req.params values as `string | string[]`; unwrap to plain string. */
function p(req: Request, key: string): string {
  const v = req.params[key];
  return Array.isArray(v) ? v[0] : (v as string);
}

export async function listConfigsHandler(_req: Request, res: Response) {
  const configs = await listConfigs();
  res.json({ ok: true, data: configs });
}

export async function getConfigHandler(req: Request, res: Response) {
  const config = await getConfig(p(req, "id"));
  if (!config) return res.status(404).json({ ok: false, error: "Not found" });
  res.json({ ok: true, data: config });
}

export async function createConfigHandler(req: Request, res: Response) {
  const body = req.body as Partial<SourceConfig>;
  const method = body.method ?? "html";

  if (!body.id || !body.baseUrl) {
    return res.status(400).json({ ok: false, error: "id and baseUrl are required" });
  }
  if (method === "html" && (!body.seriesUrl || !body.chapterUrl)) {
    return res.status(400).json({ ok: false, error: "seriesUrl and chapterUrl are required for html method" });
  }

  const config = await createConfig({
    id: body.id,
    baseUrl: body.baseUrl.replace(/\/$/, ""),
    method,
    urlFormat: body.urlFormat ?? "slug",
    seriesUrl: body.seriesUrl ?? "",
    chapterUrl: body.chapterUrl ?? "",
    apiBase: (body.apiBase ?? "").replace(/\/$/, ""),
    enabled: body.enabled ?? true,
    ...(body.searchParam   ? { searchParam:   body.searchParam   } : {}),
    ...(body.wpApiPath     ? { wpApiPath:     body.wpApiPath     } : {}),
    ...(body.customHeaders ? { customHeaders: body.customHeaders } : {}),
    ...(body.titleAfterPipe ? { titleAfterPipe: body.titleAfterPipe } : {}),
    ...(body.proxyImages    ? { proxyImages:    body.proxyImages    } : {}),
  });
  registerAdapter(createConfigurableAdapter(config));
  res.status(201).json({ ok: true, data: config });
}

export async function updateConfigHandler(req: Request, res: Response) {
  const id = p(req, "id");
  const body = req.body as Partial<SourceConfig>;
  const patch: Partial<SourceConfig> = {};
  if (body.baseUrl    !== undefined) patch.baseUrl    = body.baseUrl.replace(/\/$/, "");
  if (body.method     !== undefined) patch.method     = body.method;
  if (body.urlFormat  !== undefined) patch.urlFormat  = body.urlFormat;
  if (body.seriesUrl  !== undefined) patch.seriesUrl  = body.seriesUrl;
  if (body.chapterUrl !== undefined) patch.chapterUrl = body.chapterUrl;
  if (body.apiBase       !== undefined) patch.apiBase       = body.apiBase.replace(/\/$/, "");
  if (body.enabled       !== undefined) patch.enabled       = body.enabled;
  if (body.searchParam    !== undefined) patch.searchParam    = body.searchParam    || undefined;
  if (body.wpApiPath      !== undefined) patch.wpApiPath      = body.wpApiPath      || undefined;
  if (body.customHeaders  !== undefined) patch.customHeaders  = body.customHeaders;
  if (body.titleAfterPipe !== undefined) patch.titleAfterPipe = body.titleAfterPipe || undefined;
  if (body.proxyImages    !== undefined) patch.proxyImages    = body.proxyImages    || undefined;

  const updated = await updateConfig(id, patch);
  unregisterAdapter(id);
  if (updated.enabled) registerAdapter(createConfigurableAdapter(updated));
  res.json({ ok: true, data: updated });
}

export async function deleteConfigHandler(req: Request, res: Response) {
  const id = p(req, "id");
  await deleteConfig(id);
  unregisterAdapter(id);
  res.json({ ok: true });
}

export async function reloadConfigsHandler(_req: Request, res: Response) {
  await loadConfigurableAdapters();
  res.json({ ok: true });
}

