// scripts/build-plugin.mjs — the plugin build. Bundles the 4 Datum hooks plus the
// STDIO MCP server into self-contained `plugin/lib/*.js` files using esbuild (a
// devDependency only; it is NEVER shipped to consumers). The app uses only node:
// built-ins, so every bundle has ZERO runtime dependencies: our own source tree
// is inlined and the node:* built-ins stay external (resolved by the user's
// Node >=18).
//
// The committed `plugin/lib/*.js` are the plugin's distributable: the Claude Code
// plugin's hooks.json and .mcp.json invoke them as `node ${CLAUDE_PLUGIN_ROOT}/
// lib/datum-<name>.js`, so they must run on any Node 18+ with nothing installed.
//
// Outputs:
//   hooks/datum-fence.ts  -> plugin/lib/datum-fence.js
//   hooks/datum-claim.ts  -> plugin/lib/datum-claim.js
//   hooks/datum-join.ts   -> plugin/lib/datum-join.js
//   hooks/datum-guard.ts  -> plugin/lib/datum-guard.js
//   server/mcp.ts         -> plugin/lib/datum-mcp.js
//
// These use the SAME esbuild options as scripts/build.mjs (platform node, esm,
// bundle, target node18, the same external built-ins list, and the same
// __DATUM_DIST__ / __DATUM_VERSION__ / __DATUM_ENTRY__ define injection). A
// distinct __DATUM_ENTRY__ id per bundle keeps each module's `isMain` auto-run
// block firing only for the module that is actually this bundle's entry.

import { build } from "esbuild";
import { mkdir, readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const LIB = join(ROOT, "plugin", "lib");

// the shipped version, injected so the bundles report it without reading
// package.json (which isn't in `files`).
const PKG = JSON.parse(await readFile(join(ROOT, "package.json"), "utf8"));
const VERSION = PKG.version ?? "0.0.0";

/** Shared esbuild options. node: built-ins stay external; our code is inlined. */
const COMMON = {
  platform: "node",
  format: "esm",
  bundle: true,
  target: "node18",
  // Keep every node: built-in external so the bundle has zero runtime deps.
  // The bare aliases (e.g. `fs`) are covered too, defensively.
  external: [
    "node:*",
    "fs",
    "path",
    "url",
    "http",
    "https",
    "crypto",
    "os",
    "child_process",
    "stream",
    "util",
    "events",
    "buffer",
    "sqlite",
    "node:sqlite",
  ],
  // Build flags shared by every bundle. `__DATUM_ENTRY__` is set PER bundle (in
  // the loop below) so the merged-in `isMain` auto-run blocks only fire for the
  // module that is actually this bundle's entry.
  define: {
    __DATUM_DIST__: "true",
    __DATUM_VERSION__: JSON.stringify(VERSION),
    "process.env.DATUM_DIST": '"1"',
  },
  logLevel: "info",
  legalComments: "none",
};

/**
 * One entrypoint -> one self-contained output file in plugin/lib/. `entry` is the
 * stable id the module's own `isMain` guard checks against __DATUM_ENTRY__ (see
 * runAsEntry in the source). The ids match scripts/build.mjs so the same source
 * auto-run blocks fire here.
 */
const ENTRYPOINTS = [
  { in: join(ROOT, "hooks", "datum-fence.ts"), out: join(LIB, "datum-fence.js"), entry: "fence" },
  { in: join(ROOT, "hooks", "datum-claim.ts"), out: join(LIB, "datum-claim.js"), entry: "claim" },
  { in: join(ROOT, "hooks", "datum-join.ts"), out: join(LIB, "datum-join.js"), entry: "join" },
  { in: join(ROOT, "hooks", "datum-guard.ts"), out: join(LIB, "datum-guard.js"), entry: "guard" },
  { in: join(ROOT, "server", "mcp.ts"), out: join(LIB, "datum-mcp.js"), entry: "mcp" },
];

async function main() {
  // ensure plugin/lib/ exists; do NOT clean it (the committed bundles live here
  // and the dir holds nothing else generated).
  await mkdir(LIB, { recursive: true });

  for (const ep of ENTRYPOINTS) {
    await build({
      ...COMMON,
      entryPoints: [ep.in],
      outfile: ep.out,
      define: {
        ...COMMON.define,
        __DATUM_ENTRY__: JSON.stringify(ep.entry),
      },
    });
  }

  console.log("datum: plugin build complete ->", LIB);
}

main().catch((err) => {
  console.error("datum plugin build failed:", err);
  process.exit(1);
});
