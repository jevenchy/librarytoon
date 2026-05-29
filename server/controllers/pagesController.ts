import type { Request, Response } from "express";
import type { PagesPayload } from "../../shared/types.js";
import { getPagesResult } from "../services/scraperService.js";

export async function pagesHandler(req: Request, res: Response) {
  const { sourceId, payload, fresh } = req.body as { sourceId: string; payload: PagesPayload; fresh?: boolean };
  const { pages, sourceError } = await getPagesResult(sourceId, payload.chapterId, fresh === true);
  if (sourceError && pages.length === 0) {
    res.json({ ok: false, error: sourceError, data: [] });
  } else {
    res.json({ ok: true, data: pages, partial: pages.length === 0 });
  }
}
