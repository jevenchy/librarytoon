import { Router, json, type Request, type Response } from "express";
import rateLimit from "express-rate-limit";
import {
  apiRequestSchema,
  chaptersPayloadSchema,
  titleInfoPayloadSchema,
  pagesPayloadSchema,
  searchRequestSchema,
} from "../shared/schemas.js";
import { searchHandler, chaptersHandler, titleInfoHandler, pagesHandler, sourcesHandler, healthHandler } from "./controllers/requestHandlers.js";
import { imgHandler } from "./controllers/imgController.js";
import { validate, asyncHandler } from "./middlewares.js";
import { isLoopbackIp } from "./utils/ipUtils.js";

// Use socket-level loopback check. req.ip is derived from X-Forwarded-For when trust proxy is set,
// making it spoofable if TRUST_PROXY_HOPS is over-configured.
function isLocalCaller(req: Request): boolean {
  const socketAddr = (req.socket?.remoteAddress) ?? req.ip;
  return isLoopbackIp(socketAddr);
}

const API_LIMITER = rateLimit({
  windowMs: 60_000,
  limit: 60,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  handler: (_req: Request, res: Response): void => {
    res.status(429).json({ ok: false, error: "Too many requests" });
  },
  skip: (req) => req.path === "/img" || isLocalCaller(req),
});

const IMG_LIMITER = rateLimit({
  windowMs: 60_000,
  limit: 300,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  handler: (_req: Request, res: Response): void => {
    res.status(429).json({ ok: false, error: "Too many requests" });
  },
  skip: (req) => isLocalCaller(req),
});

export const ROUTER = Router();

ROUTER.use(API_LIMITER);
ROUTER.use(json({ limit: "16kb" }));

ROUTER.get("/sources", asyncHandler(sourcesHandler));
ROUTER.get("/health",  healthHandler);
ROUTER.get("/img",     IMG_LIMITER, asyncHandler(imgHandler));

ROUTER.post("/search",     validate(searchRequestSchema),                     asyncHandler(searchHandler));
ROUTER.post("/chapters",   validate(apiRequestSchema(chaptersPayloadSchema)),  asyncHandler(chaptersHandler));
ROUTER.post("/title-info", validate(apiRequestSchema(titleInfoPayloadSchema)), asyncHandler(titleInfoHandler));
ROUTER.post("/pages",      validate(apiRequestSchema(pagesPayloadSchema)),     asyncHandler(pagesHandler));

ROUTER.use((_req, res) => res.status(404).json({ ok: false, error: "Not found" }));
