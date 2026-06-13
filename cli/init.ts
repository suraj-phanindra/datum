// cli/init.ts — the `npx datum init` installer (sole owner: hooks-installer).
//
// init() writes/merges a Datum block into .claude/settings.json:
//   - hooks.SessionStart  -> node hooks/datum-join.ts
//   - hooks.PostToolUse   "Edit|Write|MultiEdit" -> node hooks/datum-claim.ts
//   - hooks.PreToolUse    "Edit|Write|MultiEdit" -> node hooks/datum-fence.ts
//       (datum-fence.ts is authored by the fence track; we only WIRE it.)
//   - mcpServers.datum    -> node server/mcp.ts (built by the mcp-server track)
// and seeds .datum/state.json { session_id, human, branch, last_synced_version,
// claim_files, claim_symbols, bus_url }.
//
// Idempotent: running twice is a no-op (mergeSettingsBlock never clobbers or
// duplicates). All hook entries use the EXEC form
//   { type:"command", command:"node", args:["${CLAUDE_PROJECT_DIR}/hooks/<x>.ts"] }
// with the ${CLAUDE_PROJECT_DIR} placeholder so they resolve in any workspace.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { randomUUID } from "node:crypto";

const PROJECT_DIR = "${CLAUDE_PROJECT_DIR}";

export type HookCommand = {
  type: "command";
  command: string;
  args?: string[];
};

export type HookMatcherEntry = {
  matcher?: string;
  hooks: HookCommand[];
};

export type Settings = {
  hooks?: Record<string, HookMatcherEntry[]>;
  mcpServers?: Record<string, unknown>;
  [k: string]: unknown;
};

export type InitOptions = {
  projectDir: string;
  busUrl?: string;
  human?: string;
  branch?: string;
  claimFiles?: string[];
  claimSymbols?: string[];
  sessionId?: string;
};

export type InitResult = {
  settingsPath: string;
  statePath: string;
  settings: Settings;
  state: DatumState;
  wired: string[];
};

export type DatumState = {
  session_id: string;
  human: string;
  branch: string;
  last_synced_version: number;
  claim_files: string[];
  claim_symbols: string[];
  bus_url: string;
};

export const DEFAULT_BUS_URL = "http://127.0.0.1:4317";

// EXEC-form node command for a hook script under ${CLAUDE_PROJECT_DIR}.
function nodeHook(rel: string): HookCommand {
  return { type: "command", command: "node", args: [`${PROJECT_DIR}/${rel}`] };
}

/**
 * mergeSettingsBlock — idempotent merge of one named "block" into a settings
 * object. A block is a partial Settings ({ hooks?, mcpServers?, ... }). Running
 * twice with the same block is a no-op: hook entries are matched by
 * (matcher + the set of command/args) and never duplicated; mcpServers keys are
 * only set if absent (never clobbered).
 *
 * blockKey is a stable identity used purely for de-dup bookkeeping; the merge is
 * value-based so re-invoking with the same block can't grow the file.
 */
export function mergeSettingsBlock(
  settings: Settings,
  blockKey: string,
  block: Partial<Settings>,
): Settings {
  const out: Settings = settings ?? {};

  // ---- hooks: merge per event, de-dup matcher entries + command entries ----
  if (block.hooks) {
    out.hooks = out.hooks ?? {};
    for (const [event, incomingEntries] of Object.entries(block.hooks)) {
      const existing = out.hooks[event] ?? [];
      for (const incoming of incomingEntries) {
        const match = existing.find((e) => (e.matcher ?? "") === (incoming.matcher ?? ""));
        if (!match) {
          // no entry for this matcher yet: add it (clone to avoid shared refs).
          existing.push({
            matcher: incoming.matcher,
            hooks: incoming.hooks.map((h) => ({ ...h, args: h.args ? [...h.args] : undefined })),
          });
          continue;
        }
        // matcher exists: add only the command entries it doesn't already have.
        for (const h of incoming.hooks) {
          const dup = match.hooks.some((x) => sameCommand(x, h));
          if (!dup) match.hooks.push({ ...h, args: h.args ? [...h.args] : undefined });
        }
      }
      out.hooks[event] = existing;
    }
  }

  // ---- mcpServers: only fill missing keys, never clobber an existing stanza --
  if (block.mcpServers) {
    out.mcpServers = out.mcpServers ?? {};
    for (const [name, stanza] of Object.entries(block.mcpServers)) {
      if (!(name in out.mcpServers)) out.mcpServers[name] = stanza;
    }
  }

  // ---- any other top-level keys: fill if absent (don't clobber) ----
  for (const [k, v] of Object.entries(block)) {
    if (k === "hooks" || k === "mcpServers") continue;
    if (!(k in out)) out[k] = v;
  }

  return out;
}

function sameCommand(a: HookCommand, b: HookCommand): boolean {
  if ((a.command ?? "") !== (b.command ?? "")) return false;
  const aa = a.args ?? [];
  const ba = b.args ?? [];
  if (aa.length !== ba.length) return false;
  return aa.every((x, i) => x === ba[i]);
}

/** The Datum settings block (hooks + MCP). EXEC form, ${CLAUDE_PROJECT_DIR}. */
export function datumSettingsBlock(): Partial<Settings> {
  return {
    hooks: {
      SessionStart: [{ hooks: [nodeHook("hooks/datum-join.ts")] }],
      PostToolUse: [{ matcher: "Edit|Write|MultiEdit", hooks: [nodeHook("hooks/datum-claim.ts")] }],
      PreToolUse: [{ matcher: "Edit|Write|MultiEdit", hooks: [nodeHook("hooks/datum-fence.ts")] }],
    },
    mcpServers: {
      datum: { command: "node", args: [`${PROJECT_DIR}/server/mcp.ts`] },
    },
  };
}

/**
 * init — write/merge .claude/settings.json + seed .datum/state.json. Idempotent.
 */
export function init(opts: InitOptions): InitResult {
  const projectDir = opts.projectDir;
  const busUrl = opts.busUrl || process.env.DATUM_BUS_URL || DEFAULT_BUS_URL;

  // 1) merge the Datum block into .claude/settings.json (create if absent).
  const settingsPath = join(projectDir, ".claude", "settings.json");
  const settings = readSettings(settingsPath);
  const merged = mergeSettingsBlock(settings, "datum", datumSettingsBlock());
  writeJson(settingsPath, merged);

  // 2) seed .datum/state.json (don't clobber an existing session_id /
  //    last_synced_version — re-running init keeps a live session intact).
  const statePath = join(projectDir, ".datum", "state.json");
  const existing = readState(statePath);
  const state: DatumState = {
    session_id: existing.session_id || opts.sessionId || randomUUID(),
    human: opts.human ?? existing.human ?? "",
    branch: opts.branch ?? existing.branch ?? "",
    last_synced_version: existing.last_synced_version ?? 0,
    claim_files: opts.claimFiles ?? existing.claim_files ?? [],
    claim_symbols: opts.claimSymbols ?? existing.claim_symbols ?? [],
    bus_url: busUrl,
  };
  writeJson(statePath, state);

  return {
    settingsPath,
    statePath,
    settings: merged,
    state,
    wired: [
      "SessionStart -> hooks/datum-join.ts",
      "PostToolUse(Edit|Write|MultiEdit) -> hooks/datum-claim.ts",
      "PreToolUse(Edit|Write|MultiEdit) -> hooks/datum-fence.ts",
      "mcpServers.datum -> server/mcp.ts",
    ],
  };
}

// ---- IO helpers ----

function readSettings(path: string): Settings {
  if (!existsSync(path)) return {};
  try {
    return JSON.parse(readFileSync(path, "utf8")) as Settings;
  } catch {
    return {};
  }
}

function readState(path: string): Partial<DatumState> {
  if (!existsSync(path)) return {};
  try {
    return JSON.parse(readFileSync(path, "utf8")) as Partial<DatumState>;
  } catch {
    return {};
  }
}

function writeJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(value, null, 2) + "\n", "utf8");
}
