// hooks/datum-claim.ts — the PostToolUse hook. Streams every Edit/Write/
// MultiEdit to the bus as an `edit.streamed` event, then performs the RE-SYNC
// WRITE-BACK (RECONCILIATION gap #2): advance last_synced_version to the epoch
// the bus returns, both via PATCH /sessions/:id AND in local .datum/state.json.
// Without this a reconciled agent stays "behind by one epoch" forever and the
// Stop guard loops. Runnable via: node hooks/datum-claim.ts
//
// Contract (Claude Code PostToolUse):
//   - reads a PostToolUse JSON envelope on stdin
//     { session_id, cwd, tool_name, tool_input, tool_response ?? tool_output }
//   - builds edit.streamed { session_id, human, tool_name, path, summary }
//        (path from tool_input.file_path ?? tool_input.path)
//   - POST {bus}/events -> { ok, registry_version, delta? }
//   - PATCH {bus}/sessions/:id { last_synced_version: registry_version }
//   - writes last_synced_version back to .datum/state.json
//   - optionally prints { hookSpecificOutput:{ hookEventName:'PostToolUse',
//        additionalContext:"datum: synced to v{n}" } }
//
// FAIL OPEN: bus down -> exit 0, no resync, append a warning. NEVER throws.

import { readFileSync, writeFileSync, appendFileSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";

const BUS_BUDGET_MS = 1000;

type PostToolUseInput = {
  session_id?: string;
  cwd?: string;
  tool_name?: string;
  tool_input?: Record<string, unknown>;
  tool_response?: Record<string, unknown>;
  tool_output?: Record<string, unknown>;
};

type DatumState = {
  session_id?: string;
  human?: string;
  branch?: string;
  last_synced_version?: number;
  claim_files?: string[];
  claim_symbols?: string[];
  bus_url?: string;
};

async function main(): Promise<void> {
  const raw = await readStdin();
  let input: PostToolUseInput = {};
  try {
    input = raw ? (JSON.parse(raw) as PostToolUseInput) : {};
  } catch {
    return; // malformed envelope -> fail open silently
  }

  const cwd = input.cwd || process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const datumDir = join(cwd, ".datum");
  const statePath = join(datumDir, "state.json");
  const state = readState(statePath);

  const busUrl = state.bus_url || process.env.DATUM_BUS_URL || "http://127.0.0.1:4317";
  const sessionId = input.session_id || state.session_id || "";

  // PostToolUse input field is tool_response ?? tool_output (Phase-0 verified).
  const toolResponse = input.tool_response ?? input.tool_output ?? {};
  const ti = input.tool_input ?? {};

  const path = String((ti.file_path as string | undefined) ?? (ti.path as string | undefined) ?? "");
  const toolName = input.tool_name ?? "Edit";
  // Stream the FULL edit content as `after` (+ `before`) so the bus watchlist can
  // parse the contract change (e.g. ALTER TABLE ... RENAME COLUMN). A first-line
  // `summary` alone loses the change — the migration's first line is a comment —
  // which would degrade the delta to kind:'decision' and the fence would ALLOW.
  const after = editContent(ti, toolResponse);
  const before = typeof ti.old_string === "string" ? (ti.old_string as string) : null;
  const why = leadingComment(after);
  const summary = firstLine(after);

  // No path -> nothing to stream (e.g. a non-file tool slipped past the matcher).
  if (!path) return;

  const deadline = Date.now() + BUS_BUDGET_MS;

  // 1) POST /events edit.streamed -> { ok, registry_version, delta? }.
  let events: { ok?: boolean; registry_version?: number } | null = null;
  try {
    events = await postEvent(busUrl, deadline, {
      type: "edit.streamed",
      session_id: sessionId,
      human: state.human ?? "",
      tool_name: toolName,
      path,
      before,
      after, // FULL content so the bus can parse the contract change
      ...(why ? { why } : {}),
      summary,
    });
  } catch (err) {
    return failOpen(datumDir, `bus /events error: ${errMsg(err)}`);
  }

  if (!events || typeof events.registry_version !== "number") {
    return failOpen(datumDir, `bus /events unreachable at ${busUrl}`);
  }

  const registryVersion = events.registry_version;

  // 2) RE-SYNC WRITE-BACK: advance last_synced_version on the bus AND locally.
  if (sessionId) {
    await patchSession(busUrl, deadline, sessionId, registryVersion);
  }
  writeState(statePath, { ...state, last_synced_version: registryVersion });

  // 3) optionally confirm sync to the agent.
  emit({
    hookSpecificOutput: {
      hookEventName: "PostToolUse",
      additionalContext: `datum: synced to v${registryVersion}`,
    },
  });
}

// ---- summary (compact human-readable description of the edit) ----

const MAX_CONTENT = 64 * 1024; // cap streamed content: classification needs the head, not megabytes

function editContent(
  ti: Record<string, unknown>,
  toolResponse: Record<string, unknown>,
): string {
  const content = String(
    (ti.new_string as string | undefined) ??
      (ti.content as string | undefined) ??
      (ti.file_text as string | undefined) ??
      (ti.command as string | undefined) ??
      (toolResponse.content as string | undefined) ??
      "",
  );
  return content.length > MAX_CONTENT ? content.slice(0, MAX_CONTENT) : content;
}

// compact display line: first non-empty line of the edit, truncated.
function firstLine(content: string): string {
  const fl = content.split("\n").map((l) => l.trim()).find((l) => l.length > 0) ?? "";
  return fl.length > 200 ? fl.slice(0, 197) + "..." : fl;
}

// if the edit's first non-empty line is a comment (--, //, #), surface it as the
// author's `why` so it flows into the delta + ledger; else "".
function leadingComment(content: string): string {
  for (const raw of content.split("\n")) {
    const l = raw.trim();
    if (!l) continue;
    const m = l.match(/^(?:--|\/\/|#)\s*(.+)$/);
    return m ? m[1].trim() : "";
  }
  return "";
}

// ---- bus IO ----

async function postEvent(
  busUrl: string,
  deadline: number,
  payload: Record<string, unknown>,
): Promise<Record<string, any> | null> {
  const remaining = deadline - Date.now();
  if (remaining <= 0) return null;
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), remaining);
  try {
    const res = await fetch(`${busUrl}/events`, {
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

async function patchSession(
  busUrl: string,
  deadline: number,
  sessionId: string,
  version: number,
): Promise<void> {
  const remaining = deadline - Date.now();
  if (remaining <= 0) return;
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), remaining);
  try {
    await fetch(`${busUrl}/sessions/${encodeURIComponent(sessionId)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ last_synced_version: version }),
      signal: ac.signal,
    });
  } catch {
    // best-effort; the local write-back below still advances the fence cache.
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
      `${new Date().toISOString()} claim fail-open: ${message}\n`,
    );
  } catch {
    /* best-effort; never throw */
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

// Run: `node hooks/datum-claim.ts`. Never throw — always exit 0.
const isMain = (() => {
  try {
    return import.meta.url === `file://${resolve(process.argv[1] ?? "")}`;
  } catch {
    return false;
  }
})();

if (isMain) {
  main()
    .catch(() => {
      /* last-resort fail open */
    })
    .finally(() => process.exit(0));
}
