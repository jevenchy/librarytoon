import { Router } from "express";
import { validate } from "../middlewares/validate.js";
import {
  apiRequestSchema,
  chaptersPayloadSchema,
  titleInfoPayloadSchema,
  pagesPayloadSchema,
  readRangePayloadSchema,
  searchPayloadSchema
} from "../../shared/schemas.js";
import { searchHandler } from "../controllers/searchController.js";
import { chaptersHandler } from "../controllers/chaptersController.js";
import { titleInfoHandler } from "../controllers/titleInfoController.js";
import { pagesHandler } from "../controllers/pagesController.js";
import { readRangeHandler } from "../controllers/readRangeController.js";
import { sourcesHandler } from "../controllers/sourcesController.js";
import { imgHandler } from "../controllers/imgController.js";
import {
  listConfigsHandler,
  getConfigHandler,
  createConfigHandler,
  updateConfigHandler,
  deleteConfigHandler,
  reloadConfigsHandler
} from "../controllers/sourceConfigController.js";
import { healthHandler } from "../controllers/healthController.js";

export const router = Router();

router.get("/sources", sourcesHandler);
router.get("/health", healthHandler);
router.get("/img", imgHandler);
router.post("/search", validate(apiRequestSchema(searchPayloadSchema)), searchHandler);
router.post("/chapters", validate(apiRequestSchema(chaptersPayloadSchema)), chaptersHandler);
router.post("/title-info", validate(apiRequestSchema(titleInfoPayloadSchema)), titleInfoHandler);
router.post("/pages", validate(apiRequestSchema(pagesPayloadSchema)), pagesHandler);
router.post("/read-range", validate(apiRequestSchema(readRangePayloadSchema)), readRangeHandler);

// Source config CRUD (static routes before /:id)
router.get("/source-configs", listConfigsHandler);
router.post("/source-configs", createConfigHandler);
router.post("/source-configs/reload", reloadConfigsHandler);
router.get("/source-configs/:id", getConfigHandler);
router.put("/source-configs/:id", updateConfigHandler);
router.delete("/source-configs/:id", deleteConfigHandler);

router.use((_req, res) => res.status(404).json({ ok: false, error: "Not found" }));
