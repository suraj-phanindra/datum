// hooks/datum-join.ts — the SessionStart hook. Registers the session with the
// bus and injects a compact registry snapshot into the agent's first context.
// Runnable via: node hooks/datum-join.ts
//
// Contract (Claude Code SessionStart):
//   - reads a SessionStart JSON envelope on stdin { session_id, cwd, source }
//   - loads .datum/state.json (human, branch, claim_files, claim_symbols, bus_url)
//   - POST {bus}/sessions { session_id, human, branch, claim_files, claim_symbols }
//        -> { registry_version, snapshot, advisories }
//   - prints { hookSpecificOutput:{ hookEventName:'SessionStart',
//        additionalContext } } where additionalContext is a compact, human-
//        readable registry snapshot ("datum: synced to v8; contracts: db.users
//        v8, api.GET /users/:id v3, ...").
//   - writes last_synced_version back to .datum/state.json.
//
// FAIL OPEN: bus down -> exit 0, no context, append a warning. NEVER throws.

import { readFileSync, writeFileSync, appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { runAsEntry } from "../server/entry.ts";
import { gitUserName, gitUserEmail, currentBranch, deriveWorkspaceId } from "../cli/lib/git.ts";
import { readConfig } from "../cli/lib/config.ts";
import { readState as readLibState, writeState as writeLibState } from "../cli/lib/state.ts";

const BUS_BUDGET_MS = 1000;

type SessionStartInput = {
  session_id?: string;
  cwd?: string;
  source?: string;
};

type DatumState = {
  session_id?: string;
  human?: string;
  email?: string;
  branch?: string;
  workspace_id?: string;
  last_synced_version?: number;
  claim_files?: string[];
  claim_symbols?: string[];
  bus_url?: string;
};

type Contract = { id: string; current_version: number };

async function main(): Promise<void> {
  const raw = await readStdin();
  let input: SessionStartInput = {};
  try {
    input = raw ? (JSON.parse(raw) as SessionStartInput) : {};
  } catch {
    return; // malformed envelope -> fail open silently
  }

  const cwd = input.cwd || process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const datumDir = join(cwd, ".datum");
  const statePath = join(datumDir, "state.json");

  // Zero-init: if there is no usable local state yet (plugin install, no separate
  // `datum init`), seed it from the git-native helpers so SessionStart can register
  // a real identity. Fail-soft + idempotent (never clobbers a valid state).
  seedStateIfNeeded(cwd, input.session_id);

  const state = readState(statePath);

  const busUrl = state.bus_url || process.env.DATUM_BUS_URL || "http://127.0.0.1:4317";
  const sessionId = input.session_id || state.session_id || "";

  // POST /sessions under a strict budget; any failure -> fail open.
  const deadline = Date.now() + BUS_BUDGET_MS;
  let body: {
    registry_version?: number;
    workspace_id?: string;
    warning?: string;
    snapshot?: { registry_version?: number; contracts?: Contract[] };
    advisories?: unknown[];
  } | null = null;
  try {
    body = await postSession(busUrl, deadline, {
      session_id: sessionId,
      human: state.human ?? "",
      email: state.email ?? "",
      branch: state.branch ?? "",
      workspace_id: state.workspace_id ?? "",
      claim_files: state.claim_files ?? [],
      claim_symbols: state.claim_symbols ?? [],
    });
  } catch (err) {
    return failOpen(datumDir, `bus error: ${errMsg(err)}`);
  }

  if (!body || typeof body.registry_version !== "number") {
    return failOpen(datumDir, `bus /sessions unreachable at ${busUrl}`);
  }

  const registryVersion = body.registry_version;
  const contracts = body.snapshot?.contracts ?? [];

  // persist the synced epoch back to local state (cache for the fence fast path).
  writeState(statePath, { ...state, session_id: sessionId || state.session_id, last_synced_version: registryVersion });

  // §10: a bus workspace-mismatch warning is surfaced (fail-open) but never blocks.
  let additionalContext = renderSnapshot(registryVersion, contracts, (body.advisories ?? []).length);
  if (body.warning) {
    additionalContext += ` datum: ${body.warning}.`;
  }
  emit({
    hookSpecificOutput: {
      hookEventName: "SessionStart",
      additionalContext,
    },
  });
}

// ---- snapshot rendering (compact, human-readable; not-a-dashboard prose) ----

function renderSnapshot(version: number, contracts: Contract[], advisoryCount: number): string {
  const head = `datum: synced to v${version}`;
  if (contracts.length === 0) return `${head}.`;
  const list = contracts
    .map((c) => `${c.id} v${c.current_version}`)
    .join(", ");
  const adv = advisoryCount > 0 ? ` ${advisoryCount} advisory${advisoryCount === 1 ? "" : "(s)"} pending.` : "";
  return `${head}; contracts: ${list}.${adv}`;
}

// ---- bus IO ----

async function postSession(
  busUrl: string,
  deadline: number,
  payload: Record<string, unknown>,
): Promise<Record<string, any> | null> {
  const remaining = deadline - Date.now();
  if (remaining <= 0) return null;
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), remaining);
  try {
    const res = await fetch(`${busUrl}/sessions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: ac.signal,
    });
    if (!res.ok) return null;
    return (await res.json()) as Record<string, any>;
  } catch {
    return null; // fail open
  } finally {
    clearTimeout(timer);
  }
}

// ---- fail open ----

function failOpen(datumDir: string, message: string): void {
  try {
    mkdirSync(datumDir, { recursive: true });
    appendFileSync(
      join(datumDir, "warnings.log"),
      `${new Date().toISOString()} join fail-open: ${message}\n`,
    );
  } catch {
    /* even the warning is best-effort; never throw */
  }
  // no stdout -> no context injected, session proceeds.
}

// ---- zero-init self-seed ----

/**
 * Seed .datum/state.json from the git-native helpers when it is missing or
 * incomplete (lacks session_id / human / workspace_id). Reuses cli/lib/{git,
 * config,state}.ts so there is no duplicated git logic. Fail-soft (any error ->
 * skip, never block SessionStart) and idempotent (a valid state is left intact).
 */
function seedStateIfNeeded(cwd: string, sessionId?: string): void {
  try {
    const existing = readLibState(cwd);
    // Idempotent: a state that already carries an identity is never clobbered.
    if (existing && existing.session_id && existing.human && existing.workspace_id) {
      return;
    }

    // bus_url precedence: committed datum.json > DATUM_BUS_URL env > default.
    const committed = readConfig(cwd)?.bus_url;
    const busUrl = committed || process.env.DATUM_BUS_URL || "http://127.0.0.1:4317";

    writeLibState(
      {
        session_id: existing?.session_id || sessionId || randomUUID(),
        human: existing?.human || gitUserName(cwd),
        email: existing?.email || gitUserEmail(cwd),
        branch: existing?.branch || currentBranch(cwd),
        workspace_id: existing?.workspace_id || deriveWorkspaceId(cwd),
        last_synced_version: existing?.last_synced_version ?? 0,
        claim_files: existing?.claim_files ?? [],
        claim_symbols: existing?.claim_symbols ?? [],
        bus_url: existing?.bus_url || busUrl,
      },
      cwd,
    );
  } catch {
    /* fail-soft: seeding never blocks SessionStart */
  }
}

// ---- state + stdin ----

function readState(statePath: string): DatumState {
  try {
    return JSON.parse(readFileSync(statePath, "utf8")) as DatumState;
  } catch {
    return {};
  }
}

function writeState(statePath: string, state: DatumState): void {
  try {
    mkdirSync(join(statePath, ".."), { recursive: true });
    writeFileSync(statePath, JSON.stringify(state, null, 2) + "\n", "utf8");
  } catch {
    /* best-effort; never throw */
  }
}

function readStdin(): Promise<string> {
  return new Promise((resolveStdin) => {
    let data = "";
    if (process.stdin.isTTY) return resolveStdin("");
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => (data += chunk));
    process.stdin.on("end", () => resolveStdin(data));
    process.stdin.on("error", () => resolveStdin(data));
  });
}

function emit(obj: unknown): void {
  process.stdout.write(JSON.stringify(obj));
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

// Run: `node hooks/datum-join.ts` (dev) or the bundled dist/hooks/datum-join.js
// (dist). Never throw — always exit 0.
const isMain = runAsEntry(import.meta.url, "join");

if (isMain) {
  main()
    .catch(() => {
      /* last-resort fail open */
    })
    .finally(() => process.exit(0));
}
