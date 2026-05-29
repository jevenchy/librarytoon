import type { Request, Response } from "express";
import type { ReadRangePayload } from "../../shared/types.js";
import { readRange } from "../services/scraperService.js";
import { broadcastProgress } from "../services/wsService.js";

export async function readRangeHandler(req: Request, res: Response) {
  const { sourceId, payload } = req.body as { sourceId: string; payload: ReadRangePayload };
  const jobId = `${sourceId}:${payload.titleId}:${payload.chapterStart}-${payload.chapterEnd}`;
  const result = await readRange(
    sourceId,
    payload.titleId,
    payload.chapterStart,
    payload.chapterEnd,
    (info) => broadcastProgress({ jobId, ...info })
  );
  res.json({ ok: true, data: result, partial: result.failed.length > 0 });
}
