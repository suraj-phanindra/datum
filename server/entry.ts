// server/entry.ts — "is this module the process entrypoint?" detection that is
// correct BOTH for native-TS dev (one module per file) AND for the bundled dist
// build (esbuild inlines several `isMain` modules into ONE output file, so
// import.meta.url is identical for all of them).
//
// Dev: there is exactly one module per file, so the classic
//   import.meta.url === file://<process.argv[1]>
// check is sufficient and __DATUM_ENTRY__ is undefined.
//
// Dist: every entrypoint bundle injects __DATUM_ENTRY__ = "<id>" (scripts/build.mjs)
// naming WHICH module is that bundle's real entry. The other modules' auto-run
// blocks are inlined too, but their id won't match, so they stay dormant. This is
// what stops dist/datum.js (which inlines server/index.ts) from auto-starting a
// second bus and colliding on the port.

import { resolve } from "node:path";

// Injected per-bundle by esbuild's `define` in the dist build; undefined in dev.
declare const __DATUM_ENTRY__: string | undefined;

/**
 * runAsEntry(moduleUrl, id) — true iff this module should run its process-entry
 * block now. `moduleUrl` is the caller's import.meta.url; `id` is the module's
 * stable build id (must match the `entry` in scripts/build.mjs).
 */
export function runAsEntry(moduleUrl: string, id: string): boolean {
  // Dist build: only the bundle whose injected entry id matches runs its block.
  try {
    if (typeof __DATUM_ENTRY__ !== "undefined" && __DATUM_ENTRY__) {
      return __DATUM_ENTRY__ === id;
    }
  } catch {
    /* not defined in dev */
  }
  // Dev / native TS: classic process-entry detection. resolve() normalises a
  // relative argv[1] (how the hooks are sometimes spawned) to an absolute path so
  // the file:// comparison holds; resolve() of an absolute path is a no-op.
  try {
    return moduleUrl === `file://${resolve(process.argv[1] ?? "")}`;
  } catch {
    return false;
  }
}
