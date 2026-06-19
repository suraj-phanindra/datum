// scripts/build-core.mjs — mirror the canonical server/ tree into core/server/.
//
// @datum/core ships TypeScript source (the only consumer is an esbuild/TS Worker,
// so there is no JS bundling or .d.ts generation). core/index.ts re-exports from
// "./server/...". The server/ tree is the SINGLE source of truth; this script
// recreates core/server as an exact mirror so every internal relative .ts import
// inside server/ keeps resolving inside the published package. Node built-ins only.

import { cp, rm, mkdir, readdir, stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..");
const srcDir = join(repoRoot, "server");
const destDir = join(repoRoot, "core", "server");

async function countFiles(dir) {
  let n = 0;
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      n += await countFiles(full);
    } else {
      n += 1;
    }
  }
  return n;
}

async function main() {
  const exists = await stat(srcDir).then(() => true).catch(() => false);
  if (!exists) {
    throw new Error(`source tree not found: ${srcDir}`);
  }

  // 1) recursively delete the previous mirror.
  await rm(destDir, { recursive: true, force: true });

  // 2) recursively copy the entire server/ tree into core/server.
  await mkdir(dirname(destDir), { recursive: true });
  await cp(srcDir, destDir, { recursive: true });

  const fileCount = await countFiles(destDir);
  console.log(`[build-core] mirrored server/ -> core/server (${fileCount} files)`);
}

main().catch((err) => {
  console.error("[build-core] failed:", err.message);
  process.exit(1);
});
