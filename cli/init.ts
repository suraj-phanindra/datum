// cli/init.ts — the `npx datumctl init` installer (sole owner: hooks-installer).
//
// init() writes/merges a Datum block into .claude/settings.json + seeds
// .datum/state.json { session_id, human, branch, last_synced_version,
// claim_files, claim_symbols, bus_url }.
//
// DUAL MODE — the wiring is resolved from the RUNNING module's own location, not
// from the user's workspace, because the hook + MCP scripts live in the datum
// INSTALL, not in the external workspace:
//
//   - DIST / installed build (the published `datumctl` package): write ABSOLUTE
//     exec-form commands that point at the bundled, self-contained scripts in the
//     install:
//       SessionStart -> node <pkgRoot>/dist/hooks/datum-join.js
//       PostToolUse  -> node <pkgRoot>/dist/hooks/datum-claim.js
//       PreToolUse   -> node <pkgRoot>/dist/hooks/datum-fence.js
//       Stop         -> node <pkgRoot>/dist/hooks/datum-guard.js
//       mcpServers.datum -> node <pkgRoot>/dist/mcp.js
//     pkgRoot/dist is derived from import.meta.url of the running bin (the bundle
//     puts init alongside the bin at dist/datum.js). The dist hooks are fully
//     self-contained (the ../server import tree is inlined), so they run with a
//     plain `node <path>` on any Node 18+.
//
//   - SOURCE / dev build (the monorepo + tests): keep the original
//     ${CLAUDE_PROJECT_DIR}/hooks/<x>.ts + server/mcp.ts behavior so native-TS
//     dev and the existing installer.test.ts stay green.
//
// The mode is chosen by the __DATUM_DIST__ build flag injected by esbuild
// (scripts/build.mjs). It is `true` only in the bundled build; undefined in the
// native-TS dev runtime.
//
// Idempotent: running twice is a no-op (mergeSettingsBlock never clobbers or
// duplicates).

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import {
  deriveWorkspaceId,
  gitUserName,
  gitUserEmail,
  currentBranch,
  repoRoot,
} from "./lib/git.ts";
import {
  readConfig,
  writeConfig,
  hasConfig,
  type DatumConfig,
} from "./lib/config.ts";

// Injected by esbuild's `define` in the dist build (scripts/build.mjs); declared
// here so the native-TS source compiles. `typeof` keeps the read ReferenceError-
// safe in dev where the symbol is never defined.
declare const __DATUM_DIST__: boolean | undefined;

/** True in the published/bundled build, false in native-TS dev + tests. */
export function isDistBuild(): boolean {
  try {
    if (typeof __DATUM_DIST__ !== "undefined" && __DATUM_DIST__) return true;
  } catch {
    /* not defined in dev */
  }
  return process.env.DATUM_DIST === "1";
}

const PROJECT_DIR = "${CLAUDE_PROJECT_DIR}";

/**
 * The dist/ root of the running install. In the bundled build this module lives
 * in dist/datum.js, so import.meta.url's directory IS the dist root. Resolved
 * lazily so the source/dev path never depends on it.
 */
function distRoot(): string {
  return dirname(fileURLToPath(import.meta.url));
}

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
  email?: string;
  branch?: string;
  workspaceId?: string;
  claimFiles?: string[];
  claimSymbols?: string[];
  sessionId?: string;
};

export type InitResult = {
  settingsPath: string;
  statePath: string;
  configPath: string;
  configCreated: boolean;
  settings: Settings;
  state: DatumState;
  config: DatumConfig;
  wired: string[];
};

// schema §8 + §10 — local per-user state (workspace_id + email are additive).
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

export const DEFAULT_BUS_URL = "http://127.0.0.1:4317";

// EXEC-form node command for a hook script.
//   dev/source: ${CLAUDE_PROJECT_DIR}/hooks/<name>.ts  (native TS, in-workspace)
//   dist/install: <pkgRoot>/dist/hooks/<name>.js       (bundled, absolute)
// `name` is the bare hook stem (e.g. "datum-fence"); the source/dist mapping is
// applied here so callers stay mode-agnostic.
function nodeHook(name: string): HookCommand {
  if (isDistBuild()) {
    return { type: "command", command: "node", args: [join(distRoot(), "hooks", `${name}.js`)] };
  }
  return { type: "command", command: "node", args: [`${PROJECT_DIR}/hooks/${name}.ts`] };
}

/** The MCP server stanza: dist -> dist/mcp.js (absolute); dev -> server/mcp.ts. */
function mcpStanza(): { command: string; args: string[] } {
  if (isDistBuild()) {
    return { command: "node", args: [join(distRoot(), "mcp.js")] };
  }
  return { command: "node", args: [`${PROJECT_DIR}/server/mcp.ts`] };
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

/**
 * The Datum settings block (hooks + MCP). EXEC form. Dual-mode: in the dist
 * build every path is an ABSOLUTE node command into the install's dist/; in dev
 * it stays the ${CLAUDE_PROJECT_DIR}/...ts source form.
 */
export function datumSettingsBlock(): Partial<Settings> {
  return {
    hooks: {
      SessionStart: [{ hooks: [nodeHook("datum-join")] }],
      PostToolUse: [{ matcher: "Edit|Write|MultiEdit", hooks: [nodeHook("datum-claim")] }],
      PreToolUse: [{ matcher: "Edit|Write|MultiEdit", hooks: [nodeHook("datum-fence")] }],
      // Stop guard (stretch, P3): refuse "done" while an unacknowledged delta
      // intersects this session's scope. Blocks locally only — emits NO bus event.
      Stop: [{ hooks: [nodeHook("datum-guard")] }],
    },
    mcpServers: {
      datum: mcpStanza(),
    },
  };
}

/**
 * init — write/merge .claude/settings.json + seed .datum/state.json + manage the
 * committed datum.json team config. Idempotent. Git-native (schema §10):
 *
 *   - human  <- git config user.name  (flag --human / DATUM_HUMAN override)
 *   - email  <- git config user.email
 *   - branch <- git rev-parse --abbrev-ref HEAD (flag --branch override)
 *   - workspace_id <- datum.json.workspace (or derived from the git remote when
 *     "auto"); flag --workspace override.
 *
 * datum.json (the shared team config, committed at the repo root): if ABSENT,
 * CREATE it (workspace:"auto", bus_url from flag/env/default — you set up the
 * team); if PRESENT, READ it so the whole team shares one bus_url + workspace.
 * Merge order for bus_url/human: datum.json < env < flags.
 */
export function init(opts: InitOptions): InitResult {
  const projectDir = opts.projectDir;

  // 0) the team config lives at the repo ROOT (committed), not necessarily the
  //    .datum/.claude dir. Fall back to projectDir when not in a git work tree.
  const root = repoRoot(projectDir) || projectDir;

  // 1) datum.json (the shared team config). Read it if present; create it on the
  //    first init. The merge precedence for bus_url is: datum.json < env < flags.
  const configCreated = !hasConfig(root);
  const existingConfig = readConfig(root);
  const busUrl =
    opts.busUrl || process.env.DATUM_BUS_URL || existingConfig?.bus_url || DEFAULT_BUS_URL;
  const config: DatumConfig = {
    workspace: opts.workspaceId || existingConfig?.workspace || "auto",
    bus_url: busUrl,
    ...(existingConfig?.watchlist ? { watchlist: existingConfig.watchlist } : {}),
    spec_path: existingConfig?.spec_path,
  };
  writeConfig(root, config);

  // 2) resolve the workspace_id: an explicit datum.json.workspace wins; "auto"
  //    (or empty) derives from the git remote. A --workspace flag forces it.
  const workspaceId =
    opts.workspaceId ||
    (config.workspace && config.workspace !== "auto" ? config.workspace : deriveWorkspaceId(projectDir));

  // 3) git-native identity. Flags / env override the git config derivation.
  const human = opts.human ?? process.env.DATUM_HUMAN ?? gitUserName(projectDir);
  const email = opts.email ?? gitUserEmail(projectDir);
  const branch = opts.branch ?? process.env.DATUM_BRANCH ?? currentBranch(projectDir);

  // 4) merge the Datum block into .claude/settings.json (create if absent).
  const settingsPath = join(projectDir, ".claude", "settings.json");
  const settings = readSettings(settingsPath);
  const merged = mergeSettingsBlock(settings, "datum", datumSettingsBlock());
  writeJson(settingsPath, merged);

  // 5) seed .datum/state.json (don't clobber an existing session_id /
  //    last_synced_version — re-running init keeps a live session intact).
  const statePath = join(projectDir, ".datum", "state.json");
  const existing = readLocalState(statePath);
  const state: DatumState = {
    session_id: existing.session_id || opts.sessionId || randomUUID(),
    human: human || existing.human || "",
    email: email || existing.email || "",
    branch: branch || existing.branch || "",
    workspace_id: workspaceId || existing.workspace_id || "",
    last_synced_version: existing.last_synced_version ?? 0,
    claim_files: opts.claimFiles ?? existing.claim_files ?? [],
    claim_symbols: opts.claimSymbols ?? existing.claim_symbols ?? [],
    bus_url: busUrl,
  };
  writeJson(statePath, state);

  // describe the wiring honestly for whichever mode produced it.
  const ext = isDistBuild() ? "js" : "ts";
  const hookBase = isDistBuild() ? join(distRoot(), "hooks") : "hooks";
  const mcpDesc = isDistBuild() ? join(distRoot(), "mcp.js") : "server/mcp.ts";

  return {
    settingsPath,
    statePath,
    configPath: join(root, "datum.json"),
    configCreated,
    settings: merged,
    state,
    config,
    wired: [
      `SessionStart -> ${join(hookBase, `datum-join.${ext}`)}`,
      `PostToolUse(Edit|Write|MultiEdit) -> ${join(hookBase, `datum-claim.${ext}`)}`,
      `PreToolUse(Edit|Write|MultiEdit) -> ${join(hookBase, `datum-fence.${ext}`)}`,
      `mcpServers.datum -> ${mcpDesc}`,
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

function readLocalState(path: string): Partial<DatumState> {
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
