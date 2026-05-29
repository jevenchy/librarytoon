import type { Request, Response } from "express";
import { getHealthSnapshot } from "../services/healthService.js";

export function healthHandler(_req: Request, res: Response): void {
  res.json({ ok: true, data: getHealthSnapshot() });
}
