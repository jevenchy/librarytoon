import type { NextFunction, Request, Response } from "express";
import type { z } from "zod";

import { LOGGER } from "./utils/logger.js";

export class AppError extends Error {
  constructor(message: string, public statusCode: number) {
    super(message);
    this.name = "AppError";
  }
}

type AsyncRouteHandler = (req: Request, res: Response, next: NextFunction) => Promise<unknown>;

// Express 4 does not forward rejected promises from async handlers. Routes them to errorHandler.
export function asyncHandler(fn: AsyncRouteHandler) {
  return (req: Request, res: Response, next: NextFunction): void => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

export function validate<T extends z.ZodTypeAny>(schema: T) {
  return (req: Request, res: Response, next: NextFunction) => {
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ ok: false, error: "Invalid request", details: parsed.error.flatten() });
      return;
    }
    req.body = parsed.data;
    next();
  };
}

const CLIENT_MESSAGE: Record<number, string> = {
  400: "Invalid request",
  404: "Not found",
  500: "Internal server error",
};

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  const message = err instanceof Error ? err.message : String(err);
  const code = (err as NodeJS.ErrnoException)?.code;
  if (code === "ERR_CANCELED" || message.toLowerCase().includes("aborted")) {
    if (!res.headersSent) res.status(499).end();
    return;
  }
  const status = err instanceof AppError ? err.statusCode : 500;
  // 4xx are client mistakes. Log at warn to avoid flooding error-level SRE alerts.
  if (status >= 500) LOGGER.error("request_failed", { message, status });
  else LOGGER.warn("request_failed", { message, status });
  res.status(status).json({ ok: false, error: CLIENT_MESSAGE[status] ?? "Internal server error" });
}
