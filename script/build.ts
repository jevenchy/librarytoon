import { build } from "vite";
import { build as esbuild } from "esbuild";
import { execSync } from "child_process";
import { readdirSync, readFileSync, cpSync } from "node:fs";
import path from "path";
import { fileURLToPath } from "url";
import { sourceConfigSchema } from "../shared/schemas.js";
import type { SourceConfig } from "../shared/types.js";
import { VALID_CONFIG_KEYS } from "../server/adapters/index.js";
import { migrate } from "../server/services/sourceConfigService.js";
import { safeRegex } from "../server/adapters/shared.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

function run(cmd: string) {
  console.log(`\n> ${cmd}`);
  execSync(cmd, { cwd: ROOT, stdio: "inherit" });
}

function validateSources() {
  const dir = path.join(ROOT, "server/sources");
  const files = readdirSync(dir).filter(file => file.endsWith(".json"));
  const errors: string[] = [];

  for (const file of files) {
    let raw: Record<string, unknown>;
    try {
      raw = JSON.parse(readFileSync(path.join(dir, file), "utf-8")) as Record<string, unknown>;
    } catch (err) {
      errors.push(`${file}: invalid JSON (${String(err)})`);
      continue;
    }
    delete raw["$schema"];

    const parsed = sourceConfigSchema.safeParse(migrate(raw as Partial<SourceConfig>));
    if (!parsed.success) {
      errors.push(`${file}: ${parsed.error.issues.map(issue => `${issue.path.join(".")}: ${issue.message}`).join("; ")}`);
    }

    const unknown = Object.keys(raw).filter(key => !VALID_CONFIG_KEYS.has(key as keyof SourceConfig));
    if (unknown.length > 0) errors.push(`${file}: unrecognized keys: ${unknown.join(", ")}`);

    const numberPattern = raw.chapterNumberPattern as string | undefined;
    const imagePattern = (raw.images as { urlPattern?: string } | undefined)?.urlPattern;
    if (numberPattern && !safeRegex(numberPattern, "i")) errors.push(`${file}: chapterNumberPattern is not ReDoS-safe`);
    if (imagePattern && !safeRegex(imagePattern)) errors.push(`${file}: images.urlPattern is not ReDoS-safe`);
  }

  if (errors.length > 0) {
    throw new Error(`source config validation failed:\n  ${errors.join("\n  ")}`);
  }
  console.log(`[build] validated ${files.length} source configs`);
}

async function main() {
  console.log("[build] validating source configs...");
  validateSources();

  console.log("[build] building client...");
  await build({ configFile: path.join(ROOT, "vite.config.ts") });

  console.log("[build] type-checking...");
  run("node --max-old-space-size=4096 node_modules/typescript/bin/tsc --noEmit --skipLibCheck");

  console.log("[build] bundling server...");
  await esbuild({
    entryPoints: [path.join(ROOT, "server/index.ts"), path.join(ROOT, "server/viteMiddleware.ts")],
    outdir: path.join(ROOT, "dist/server"),
    platform: "node",
    format: "esm",
    target: "node20",
    bundle: true,
    packages: "external",
    sourcemap: false,
    logLevel: "info",
  });

  console.log("[build] copying source configs...");
  cpSync(path.join(ROOT, "server/sources"), path.join(ROOT, "dist/sources"), { recursive: true });

  console.log("[build] done.");
}

main().catch((err) => {
  console.error("[build] failed:", err);
  process.exit(1);
});
