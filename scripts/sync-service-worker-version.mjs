import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
const workerPath = path.join(root, "public/sw.js");
const worker = await readFile(workerPath, "utf8");
const next = worker.replace(/const VERSION = '[^']+';/, `const VERSION = '${pkg.version}';`);
if (next === worker && !worker.includes(`const VERSION = '${pkg.version}';`)) {
  throw new Error("Service Worker version marker was not found");
}
if (next !== worker) await writeFile(workerPath, next);
