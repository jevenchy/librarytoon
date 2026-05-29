import type { Request, Response } from "express";
import type { SearchPayload } from "../../shared/types.js";
import { searchTitle } from "../services/scraperService.js";

export async function searchHandler(req: Request, res: Response) {
  const { sourceId, payload, fresh } = req.body as { sourceId: string; payload: SearchPayload; fresh?: boolean };
  const results = await searchTitle(sourceId, payload.query, fresh === true);
  res.json({ ok: true, data: results, partial: results.length === 0 });
}
