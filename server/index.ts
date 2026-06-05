import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import compression from "compression";
import rateLimit from "express-rate-limit";
import { ROUTER } from "./routes.js";
import { errorHandler } from "./middlewares.js";
import { warmDnsCache } from "./services/dohService.js";
import { loadConfigurableAdapters, listAdapters, clearAdapterCaches } from "./adapters/index.js";
import { invalidateConfigCache, getSourceRegexPatterns } from "./services/sourceConfigService.js";
import { clearSourceCooldowns } from "./services/scraperService.js";
import { validatePatterns } from "./utils/validatePatterns.js";
import { LOGGER } from "./utils/logger.js";
import { isLoopbackIp } from "./utils/ipUtils.js";
import { DEFAULT_PORT } from "./constants.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const IS_PROD = process.env.NODE_ENV === "production";
const PORT = Number(process.env.PORT ?? DEFAULT_PORT);

if (IS_PROD && !process.env.IMAGE_SECRET) {
  LOGGER.error("server_config", "IMAGE_SECRET not set in production. Set IMAGE_SECRET to a 32+ character random value to ensure image proxy URLs survive restarts and work in multi-instance deployments.");
  process.exit(1);
}

process.on("uncaughtException", (err) => {
  LOGGER.error("uncaught_exception", err);
  process.exit(1);
});
process.on("unhandledRejection", (reason) => {
  LOGGER.error("unhandled_rejection", reason instanceof Error ? reason : { reason: String(reason) });
});

const APP = express();

APP.set("trust proxy", Number(process.env.TRUST_PROXY_HOPS ?? 0));

if (IS_PROD && !process.env.TRUST_PROXY_HOPS) {
  // Per-IP rate limiting bans everyone or nobody when the real client IP is misread behind a proxy.
  LOGGER.error("server_config", "TRUST_PROXY_HOPS not set - rate limiting and client-IP detection will be wrong behind a reverse proxy. Set TRUST_PROXY_HOPS=1 (or the number of proxy hops), or 0 if running without a proxy.");
}

APP.use(helmet({
  contentSecurityPolicy: IS_PROD ? {
    directives: {
      defaultSrc:     ["'self'"],
      scriptSrc:      ["'self'"],
      styleSrc:       ["'self'", "'unsafe-inline'"],
      imgSrc:         ["'self'", "data:", "blob:"],
      connectSrc:     ["'self'"],
      fontSrc:        ["'self'", "data:"],
      objectSrc:      ["'none'"],
      frameAncestors: ["'none'"],
    },
  } : false,
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: "cross-origin" },
}));

const CORS_ORIGIN = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(",").map((str) => str.trim())
  : IS_PROD
    ? false
    : true;
APP.use(cors({ origin: CORS_ORIGIN }));

APP.use(compression({
  filter: (req, res) => {
    // Proxied images are already compressed. Gzipping them only burns CPU.
    const contentType = res.getHeader("Content-Type");
    if (typeof contentType === "string" && contentType.startsWith("image/")) return false;
    return compression.filter(req, res);
  }
}));

APP.use("/api", ROUTER);

// Keep /ping outside the API router so Docker/k8s liveness probes work without hitting API middleware.
// Rate-limited to prevent keep-alive flooding. Socket address is not spoofable unlike X-Forwarded-For.
const PING_LIMITER = rateLimit({
  windowMs: 60_000,
  limit: 1000,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  skip: (req) => isLoopbackIp(req.socket?.remoteAddress),
});
APP.get("/ping", PING_LIMITER, (_req, res) => res.json({ ok: true }));

async function bootstrap() {
  if (IS_PROD) {
    const clientDist = path.join(__dirname, "../public");
    APP.use(express.static(clientDist, {
      // Vite emits content-hashed asset filenames. Cache immutably for a year except index.html.
      setHeaders: (res, filePath) => {
        if (filePath.endsWith("index.html")) {
          res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
        } else {
          res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
        }
      },
    }));
    APP.get("*", (_req, res, next) => {
      res.set("Cache-Control", "no-cache, no-store, must-revalidate");
      res.sendFile(path.join(clientDist, "index.html"), err => { if (err) next(err); });
    });
  } else {
    const { setupViteMiddleware } = await import("./viteMiddleware.js");
    await setupViteMiddleware(APP);
  }

  APP.use(errorHandler);

  const server = http.createServer(APP);
  server.timeout = Number(process.env.REQUEST_TIMEOUT_MS ?? 300_000);
  server.headersTimeout = Number(process.env.HEADERS_TIMEOUT_MS ?? 20_000);
  server.requestTimeout = Number(process.env.REQUEST_TIMEOUT_MS ?? 300_000);
  server.keepAliveTimeout = Number(process.env.KEEPALIVE_TIMEOUT_MS ?? 65_000);

  // Allow in-flight requests to finish before forced kill. A long scrape can use most of REQUEST_TIMEOUT_MS.
  const shutdownTimeoutMs = Number(process.env.SHUTDOWN_TIMEOUT_MS ?? Number(process.env.REQUEST_TIMEOUT_MS ?? 300_000) + 5_000);
  const shutdown = () => {
    LOGGER.server("Shutting down...");
    server.closeIdleConnections();
    server.close(() => {
      LOGGER.server("Server closed");
      process.exit(0);
    });
    setTimeout(() => {
      LOGGER.server("Forced shutdown after timeout");
      server.closeAllConnections();
      process.exit(1);
    }, shutdownTimeoutMs).unref();
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);

  // SIGUSR1 reloads source configs without a restart, allowing a broken source to be disabled live.
  // Runs a timing-based ReDoS check in a worker thread before activating new configs.
  process.on("SIGUSR1", async () => {
    LOGGER.server("Reloading source configs (SIGUSR1)");
    try {
      const patterns = await getSourceRegexPatterns();
      const failures = await validatePatterns(patterns);
      if (failures.length > 0) {
        for (const failure of failures) LOGGER.error("sigusr1_redos_blocked", failure);
        LOGGER.error("sigusr1_reload_aborted", "Fix the patterns above, then retry SIGUSR1 or restart.");
        return;
      }
    } catch (err: unknown) {
      LOGGER.warn("sigusr1_validation_skipped", { err: String(err) });
    }
    invalidateConfigCache();
    loadConfigurableAdapters()
      .then(() => {
        clearAdapterCaches();
        clearSourceCooldowns();
        LOGGER.server(`Reloaded: ${listAdapters().length} adapters`);
      })
      .catch((err: unknown) => LOGGER.error("adapters_reload_failed", { error: String(err) }));
  });

  server.listen(PORT, () => {
    LOGGER.server(`Server starting on port ${PORT}`);
    LOGGER.server(`Environment: ${IS_PROD ? "production" : "development"}`);
    loadConfigurableAdapters()
      .catch((err: unknown) => LOGGER.warn("configurable_adapters_load_failed", { error: String(err) }))
      .then(() => {
        // Zero adapters is a misconfiguration: exits 0 but all API calls return 404. Surface at error level.
        if (listAdapters().length === 0) {
          LOGGER.error("no_adapters_loaded", "0 source adapters loaded. Check SOURCES_DIR and source config validity; all API requests will 404.");
        }
        warmDnsCache().catch((err: unknown) => LOGGER.warn("doh_warm_failed", { err: String(err) }));
      });
  });
}

bootstrap();
