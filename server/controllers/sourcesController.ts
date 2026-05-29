import type { Request, Response } from "express";
import { listAdapters } from "../adapters/index.js";

export async function sourcesHandler(_req: Request, res: Response) {
  res.json({ ok: true, data: listAdapters().filter((s) => s.enabled) });
}
