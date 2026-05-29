import http from "http";
import path from "path";
import { fileURLToPath } from "url";
import cors from "cors";
import express from "express";
import { router } from "./routes/index.js";
import { errorHandler } from "./middlewares/errorHandler.js";
import { attachWs } from "./services/wsService.js";
import { warmDnsCache, startDnsRefresh } from "./services/dohService.js";
import { startHealthCheck } from "./services/healthService.js";
import { logger } from "./utils/logger.js";
import { DEFAULT_PORT } from "./constants.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isProd = process.env.NODE_ENV === "production";
const port = Number(process.env.PORT ?? DEFAULT_PORT);

const app = express();

app.use(cors());
app.use(express.json({ limit: "1mb" }));

app.get("/health", (_req, res) => res.json({ ok: true }));
app.use("/api", router);

async function bootstrap() {
  if (isProd) {
    const clientDist = path.join(__dirname, "../dist/public");
    app.use(express.static(clientDist));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(clientDist, "index.html"));
    });
  } else {
    const { createServer } = await import("vite");
    const vite = await createServer({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  }

  app.use(errorHandler);

  const server = http.createServer(app);
  attachWs(server);
  server.listen(port, () => {
    logger.server(`Server starting on port ${port}`);
    logger.server(`Environment: ${isProd ? "production" : "development"}`);
    warmDnsCache();
    startDnsRefresh();
    startHealthCheck();
  });
}

bootstrap();
