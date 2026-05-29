import type { NextFunction, Request, Response } from "express";
import type { z } from "zod";

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
