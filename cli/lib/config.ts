// cli/lib/config.ts — read/write the COMMITTED team config, datum.json (schema
// §10). datum.json lives at the repo root and is shared via git: the FIRST
// `datum init` creates it (you set up the team), and subsequent inits READ it so
// the whole team shares one bus_url + workspace.
//
//   { "workspace": "auto",                  // "auto" = derive from the git remote
//     "bus_url": "http://127.0.0.1:4317",   // the shared bus everyone connects to
//     "watchlist": {},                       // optional contract-surface overrides
//     "spec_path": "docs/spec.md" }          // the arbiter's spec-patch target
//
// All reads are fail-soft (a missing/garbled file -> null), never a throw.

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

export const DEFAULT_BUS_URL = "http://127.0.0.1:4317";
export const DEFAULT_SPEC_PATH = "docs/spec.md";

// schema §10 — the committed team config.
export type DatumConfig = {
  workspace: string; // "auto" or an explicit workspace id
  bus_url: string;
  watchlist?: Record<string, unknown>;
  spec_path?: string;
};

/** The datum.json path for a repo root (or any dir). */
export function configPath(dir: string): string {
  return join(dir, "datum.json");
}

/** True iff a datum.json exists at `dir`. */
export function hasConfig(dir: string): boolean {
  return existsSync(configPath(dir));
}

/**
 * Read datum.json, fail-soft. Returns null when absent or unreadable so callers
 * can branch on "no team config yet" (first init -> create it).
 */
export function readConfig(dir: string): DatumConfig | null {
  const path = configPath(dir);
  if (!existsSync(path)) return null;
  try {
    const raw = JSON.parse(readFileSync(path, "utf8")) as Partial<DatumConfig>;
    return normalize(raw);
  } catch {
    return null;
  }
}

function normalize(raw: Partial<DatumConfig>): DatumConfig {
  return {
    workspace: typeof raw.workspace === "string" && raw.workspace ? raw.workspace : "auto",
    bus_url: typeof raw.bus_url === "string" && raw.bus_url ? raw.bus_url : DEFAULT_BUS_URL,
    watchlist: raw.watchlist && typeof raw.watchlist === "object" ? raw.watchlist : undefined,
    spec_path: typeof raw.spec_path === "string" && raw.spec_path ? raw.spec_path : DEFAULT_SPEC_PATH,
  };
}

/** Write datum.json to the repo root. Pretty-printed, trailing newline. */
export function writeConfig(dir: string, config: DatumConfig): void {
  const body: DatumConfig = {
    workspace: config.workspace || "auto",
    bus_url: config.bus_url || DEFAULT_BUS_URL,
    ...(config.watchlist ? { watchlist: config.watchlist } : {}),
    spec_path: config.spec_path || DEFAULT_SPEC_PATH,
  };
  writeFileSync(configPath(dir), JSON.stringify(body, null, 2) + "\n", "utf8");
}
