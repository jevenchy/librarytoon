import { Worker } from "node:worker_threads";

// Worker runs in CJS mode because eval:true defaults to CommonJS.
// Tests each regex against adversarial strings with a vm timeout to detect catastrophic backtracking.
const WORKER_CODE = `
const { parentPort, workerData } = require("worker_threads");
const vm = require("vm");
const { patterns, timeoutMs } = workerData;
const TEST_STRINGS = ["a".repeat(25), "a".repeat(20) + "!", "x".repeat(20)];
const failures = [];
for (const { pattern, flags, source } of patterns) {
  let re;
  try { re = new RegExp(pattern, flags); } catch { failures.push(source + ": invalid regex"); continue; }
  for (const str of TEST_STRINGS) {
    try { vm.runInNewContext("re.test(str)", { re, str }, { timeout: timeoutMs }); }
    catch { failures.push(source + ": possible ReDoS in " + JSON.stringify(pattern)); break; }
  }
}
parentPort.postMessage(failures);
`;

export async function validatePatterns(
  patterns: { pattern: string; flags: string; source: string }[],
  timeoutPerPatternMs = 100,
): Promise<string[]> {
  if (patterns.length === 0) return [];
  return new Promise((resolve) => {
    const worker = new Worker(WORKER_CODE, {
      eval: true,
      workerData: { patterns, timeoutMs: timeoutPerPatternMs },
    });
    const guardMs = patterns.length * timeoutPerPatternMs * 3 + 5000;
    const guard = setTimeout(() => { worker.terminate(); resolve([]); }, guardMs);
    worker.on("message", (failures: string[]) => { clearTimeout(guard); resolve(failures); });
    worker.on("error", () => { clearTimeout(guard); resolve([]); });
  });
}
