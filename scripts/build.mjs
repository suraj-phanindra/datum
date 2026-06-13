// scripts/build.mjs — the publish build. Bundles each Datum entrypoint into a
// self-contained dist/ JS file using esbuild (a devDependency only; it is NEVER
// shipped to consumers). The app itself uses only node: built-ins, so every
// bundle has ZERO runtime dependencies: our own source tree is inlined and the
// node:* built-ins stay external (resolved by the user's Node ≥18).
//
// Outputs:
//   cli/datum.ts          -> dist/datum.js          (the `datumctl` bin, shebang)
//   hooks/datum-fence.ts  -> dist/hooks/datum-fence.js   (fully self-contained;
//   hooks/datum-claim.ts  -> dist/hooks/datum-claim.js    the ../server import
//   hooks/datum-join.ts   -> dist/hooks/datum-join.js     tree is inlined, so
//   hooks/datum-guard.ts  -> dist/hooks/datum-guard.js    `node <path>` works on
//                                                          any Node 18+)
//   server/index.ts       -> dist/server.js         (the bus + registry + arbiter)
//   server/mcp.ts         -> dist/mcp.js            (the STDIO MCP server)
//
// A build flag is injected via `define` so the bundled code knows it is the
// installed/dist build:
//   __DATUM_DIST__   -> true   (a global the source can read; see cli/init.ts)
//   process.env.DATUM_DIST -> "1"
// The native-TS dev runtime never sets these, so init() keeps its source-.ts
// ${CLAUDE_PROJECT_DIR} behavior there.

import { build } from "esbuild";
import { rm, mkdir, readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DIST = join(ROOT, "dist");

// the shipped version, injected so the dist bin reports it without reading
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
  // module that is actually this bundle's entry — without it, e.g. dist/datum.js
  // (which inlines server/index.ts) would auto-start a SECOND bus and collide.
  define: {
    __DATUM_DIST__: "true",
    __DATUM_VERSION__: JSON.stringify(VERSION),
    "process.env.DATUM_DIST": '"1"',
  },
  logLevel: "info",
  legalComments: "none",
};

/**
 * One entrypoint -> one self-contained output file. `entry` is the stable id the
 * module's own `isMain` guard checks against __DATUM_ENTRY__ (see runAsEntry in
 * the source); the cli bundle is "cli" so only cli/datum.ts's main() runs there.
 */
const ENTRYPOINTS = [
  {
    in: join(ROOT, "cli", "datum.ts"),
    out: join(DIST, "datum.js"),
    entry: "cli",
    // The bin is directly executable. cli/datum.ts already begins with the
    // `#!/usr/bin/env node` hashbang, which esbuild preserves on line 1 of the
    // bundle — so it runs under the user's node. We do NOT add a banner here:
    // that would emit a SECOND `#!/usr/bin/env node` on line 2, which is invalid
    // JS and breaks the bin. (If the source ever loses its hashbang, re-add a
    // `banner: { js: "#!/usr/bin/env node" }` below.)
    bin: true,
  },
  { in: join(ROOT, "hooks", "datum-fence.ts"), out: join(DIST, "hooks", "datum-fence.js"), entry: "fence" },
  { in: join(ROOT, "hooks", "datum-claim.ts"), out: join(DIST, "hooks", "datum-claim.js"), entry: "claim" },
  { in: join(ROOT, "hooks", "datum-join.ts"), out: join(DIST, "hooks", "datum-join.js"), entry: "join" },
  { in: join(ROOT, "hooks", "datum-guard.ts"), out: join(DIST, "hooks", "datum-guard.js"), entry: "guard" },
  { in: join(ROOT, "server", "index.ts"), out: join(DIST, "server.js"), entry: "server" },
  { in: join(ROOT, "server", "mcp.ts"), out: join(DIST, "mcp.js"), entry: "mcp" },
];

async function main() {
  // clean dist/
  await rm(DIST, { recursive: true, force: true });
  await mkdir(DIST, { recursive: true });

  for (const ep of ENTRYPOINTS) {
    await build({
      ...COMMON,
      entryPoints: [ep.in],
      outfile: ep.out,
      define: {
        ...COMMON.define,
        __DATUM_ENTRY__: JSON.stringify(ep.entry),
      },
      ...(ep.banner ? { banner: ep.banner } : {}),
    });
  }

  // mark the bin executable (cosmetic; npm sets the bin perms on install too).
  try {
    const { chmod } = await import("node:fs/promises");
    await chmod(join(DIST, "datum.js"), 0o755);
  } catch {
    /* best-effort */
  }

  console.log("datum: build complete ->", DIST);
}

main().catch((err) => {
  console.error("datum build failed:", err);
  process.exit(1);
});
