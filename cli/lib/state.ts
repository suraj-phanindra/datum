// cli/lib/state.ts — read/write .datum/state.json (schema §8) + settings.json
// helpers. The state file is the cockpit's local cache: it holds the session
// identity, the claim, the last-synced epoch (the fence's cache-hit fast path),
// and the bus url. All reads are fail-soft (a missing/garbled file -> a typed
// empty shape), so the CLI can always fall back to a local view.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";

export const DEFAULT_BUS_URL = "http://127.0.0.1:4317";

// schema §8 + §10 (workspace_id + email are the additive team fields).
export type DatumState = {
  session_id: string;
  human: string;
  email: string;
  branch: string;
  workspace_id: string;
  last_synced_version: number;
  claim_files: string[];
  claim_symbols: string[];
  bus_url: string;
};

/** The project root that owns .datum/ + .claude/ (CLAUDE_PROJECT_DIR or cwd). */
export function projectDir(): string {
  return process.env.CLAUDE_PROJECT_DIR || process.cwd();
}

export function statePath(dir = projectDir()): string {
  return join(dir, ".datum", "state.json");
}

export function settingsPath(dir = projectDir()): string {
  return join(dir, ".claude", "settings.json");
}

export function settingsLocalPath(dir = projectDir()): string {
  return join(dir, ".claude", "settings.local.json");
}

export function warningsPath(dir = projectDir()): string {
  return join(dir, ".datum", "warnings.log");
}

/** True iff a state file exists for this workspace (bare `datum` -> status). */
export function hasState(dir = projectDir()): boolean {
  return existsSync(statePath(dir));
}

/**
 * Read .datum/state.json, fail-soft. Returns null when absent or unreadable so
 * callers can branch on "never initialised"; use `readStateOrDefault` when a
 * concrete shape is wanted regardless.
 */
export function readState(dir = projectDir()): DatumState | null {
  const path = statePath(dir);
  if (!existsSync(path)) return null;
  try {
    const raw = JSON.parse(readFileSync(path, "utf8")) as Partial<DatumState>;
    return normalize(raw);
  } catch {
    return null;
  }
}

/** Read state with a typed empty fallback (never null). */
export function readStateOrDefault(dir = projectDir()): DatumState {
  return readState(dir) ?? normalize({});
}

function normalize(raw: Partial<DatumState>): DatumState {
  return {
    session_id: raw.session_id ?? "",
    human: raw.human ?? "",
    email: raw.email ?? "",
    branch: raw.branch ?? "",
    workspace_id: raw.workspace_id ?? "",
    last_synced_version: Number(raw.last_synced_version ?? 0),
    claim_files: Array.isArray(raw.claim_files) ? raw.claim_files.map(String) : [],
    claim_symbols: Array.isArray(raw.claim_symbols) ? raw.claim_symbols.map(String) : [],
    bus_url: raw.bus_url || DEFAULT_BUS_URL,
  };
}

/** Write state back atomically-ish (mkdir -p then write). */
export function writeState(state: DatumState, dir = projectDir()): void {
  const path = statePath(dir);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(state, null, 2) + "\n", "utf8");
}

/** Patch + persist a subset of the state. Returns the merged state. */
export function patchState(patch: Partial<DatumState>, dir = projectDir()): DatumState {
  const merged = { ...readStateOrDefault(dir), ...patch };
  writeState(merged, dir);
  return merged;
}

// ---- settings.json (read-only inspection for doctor / uninstall) ----

export type HookCommand = { type: string; command: string; args?: string[] };
export type HookMatcherEntry = { matcher?: string; hooks: HookCommand[] };
export type Settings = {
  hooks?: Record<string, HookMatcherEntry[]>;
  mcpServers?: Record<string, unknown>;
  [k: string]: unknown;
};

/** Read .claude/settings.json fail-soft. Returns null if absent/unreadable. */
export function readSettings(path = settingsPath()): Settings | null {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8")) as Settings;
  } catch {
    return null;
  }
}

export function writeSettings(settings: Settings, path = settingsPath()): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(settings, null, 2) + "\n", "utf8");
}

/** Does a hooks event contain a command whose args reference `needle`? */
export function hookWired(settings: Settings | null, event: string, needle: string): boolean {
  const entries = settings?.hooks?.[event];
  if (!entries) return false;
  return entries.some((e) =>
    e.hooks.some((h) => (h.args ?? []).some((a) => a.includes(needle)) || h.command.includes(needle)),
  );
}

/** Is the datum MCP server registered? */
export function mcpWired(settings: Settings | null): boolean {
  return Boolean(settings?.mcpServers && "datum" in settings.mcpServers);
}
