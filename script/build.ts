import { build } from "vite";
import { execSync } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

function run(cmd: string) {
  console.log(`\n> ${cmd}`);
  execSync(cmd, { cwd: root, stdio: "inherit" });
}

async function main() {
  console.log("[build] building client...");
  await build({ configFile: path.join(root, "vite.config.ts") });

  console.log("[build] type-checking...");
  run("node --max-old-space-size=4096 node_modules/typescript/bin/tsc --noEmit --skipLibCheck");

  console.log("[build] done.");
}

main().catch((err) => {
  console.error("[build] failed:", err);
  process.exit(1);
});
