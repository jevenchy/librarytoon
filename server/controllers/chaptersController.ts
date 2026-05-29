import type { Request, Response } from "express";
import type { ChaptersPayload } from "../../shared/types.js";
import { getChaptersResult } from "../services/scraperService.js";

export async function chaptersHandler(req: Request, res: Response) {
  const { sourceId, payload, fresh } = req.body as { sourceId: string; payload: ChaptersPayload; fresh?: boolean };
  const { chapters, sourceError } = await getChaptersResult(sourceId, payload.titleId, fresh === true);
  if (sourceError && chapters.length === 0) {
    res.json({ ok: false, error: sourceError, data: [] });
  } else {
    res.json({ ok: true, data: chapters, partial: chapters.length === 0 });
  }
}
