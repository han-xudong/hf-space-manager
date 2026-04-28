import { cpSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const standaloneNextDir = join(root, ".next", "standalone", ".next");
const staticSourceDir = join(root, ".next", "static");
const staticTargetDir = join(standaloneNextDir, "static");

mkdirSync(standaloneNextDir, { recursive: true });

if (existsSync(staticSourceDir)) {
  cpSync(staticSourceDir, staticTargetDir, { recursive: true, force: true });
}