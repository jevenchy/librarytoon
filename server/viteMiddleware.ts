import type { Express } from "express";

export async function setupViteMiddleware(app: Express): Promise<void> {
  const { createServer } = await import("vite");
  const vite = await createServer({ server: { middlewareMode: true }, appType: "spa" });
  app.use(vite.middlewares);
}
