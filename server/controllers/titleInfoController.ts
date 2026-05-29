import type { Request, Response } from "express";
import type { TitleInfoPayload } from "../../shared/types.js";
import { getTitleInfo } from "../services/scraperService.js";

export async function titleInfoHandler(req: Request, res: Response) {
  const { sourceId, payload, fresh } = req.body as { sourceId: string; payload: TitleInfoPayload; fresh?: boolean };
  const info = await getTitleInfo(sourceId, payload.titleId, fresh === true);
  res.json({ ok: true, data: info });
}
