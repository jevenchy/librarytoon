import type { NextFunction, Request, Response } from "express";
import { logger } from "../utils/logger.js";

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  const message = err instanceof Error ? err.message : "Internal error";
  logger.error("request_failed", { message });
  res.status(500).json({ ok: false, error: message });
}
