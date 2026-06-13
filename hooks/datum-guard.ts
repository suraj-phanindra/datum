// hooks/datum-guard.ts — the Stop hook (stretch, P3). Refuses to let an agent
// end its turn while the registry has moved past the session's
// last_synced_version AND a fresh, unacknowledged delta intersects the session's
// claimed scope. The fence stops a *stale write*; the guard stops a *premature
// "done."* — same deterministic substrate (decideFence), no model. Runnable via:
//   node hooks/datum-guard.ts
//
// Contract (Claude Code Stop hook):
//   - reads a Stop JSON envelope on stdin { session_id, cwd, ... }
//   - loads .datum/state.json (last_synced_version, claim_files, claim_symbols,
//     bus_url)
//   - GET {bus}/version; if last_synced_version === registry_version -> ALLOW the
//     stop (exit 0) WITHOUT calling /deltas (cache-hit fast path).
//   - else GET {bus}/deltas?since=N and call decideFence per delta, passing the
//     session's accumulated diff (union of claim_symbols, the cleanest "session
//     diff" source per the PRD) as write.content.
//   - any delta yielding deny/inject (an unacknowledged intersecting delta) ->
//     BLOCK the stop: exit 2 with a stderr reason naming contract + change +
//     author (and also print {"decision":"block","reason":...} on stdout).
//   - else ALLOW (exit 0).
//
// IMPORTANT: the guard emits NO bus event. It blocks LOCALLY only and must NOT
// reuse write.fenced (that would corrupt demo-runner's "exactly one write
// fenced" assertion). FAIL OPEN: bus unreachable within ~1s -> ALLOW + append a
// line to .datum/warnings.log. The hook NEVER throws; it always exits via
// .finally.

import { readFileSync, appendFileSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";

import { decideFence, type FenceInput, type FenceDecision } from "../server/fence.ts";
import type { Delta } from "../server/store.ts";

// ~1s total budget for all bus IO; over budget / unreachable -> fail open.
const BUS_BUDGET_MS = 1000;

// Exit codes: 0 = allow the stop; 2 = block the stop (Stop hook schema).
const EXIT_ALLOW = 0;
const EXIT_BLOCK = 2;

type StopInput = {
  session_id?: string;
  cwd?: string;
  [k: string]: unknown;
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

/**
 * main — returns the desired exit code. ALLOW = 0, BLOCK = 2. Never throws; any
 * unexpected failure resolves to ALLOW (fail open) at the call site.
 */
async function main(): Promise<number> {
  const raw = await readStdin();
  let input: StopInput = {};
  try {
    input = raw ? (JSON.parse(raw) as StopInput) : {};
  } catch {
    // malformed envelope -> fail open silently (allow the stop).
    return EXIT_ALLOW;
  }

  const cwd = input.cwd || process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const datumDir = join(cwd, ".datum");
  const state = readState(datumDir);

  const busUrl =
    state.bus_url || process.env.DATUM_BUS_URL || "http://127.0.0.1:4317";
  const lastSynced = Number(state.last_synced_version ?? 0);

  // The "session diff" (PRD open-question): cleanest source is the union of the
  // session's claim_symbols, avoiding a git diff shell-out. decideFence does a
  // word-boundary match, so a claim of ".email" trips a rename of email but a
  // claim swapped to "contact_email" does not.
  const content = (state.claim_symbols ?? []).join("\n");
  // A representative path for the area-hit check: use the first claimed file (so
  // an inject in the session's scope still blocks the stop).
  const path = (state.claim_files ?? [])[0] ?? "";

  // Bus IO under a strict total budget. Any failure / timeout -> fail open.
  const deadline = Date.now() + BUS_BUDGET_MS;
  let currentVersion: number;
  let deltas: Delta[];
  try {
    const version = await getVersion(busUrl, deadline);
    if (version == null) {
      failOpen(datumDir, `bus /version unreachable at ${busUrl}`);
      return EXIT_ALLOW;
    }
    currentVersion = version;

    if (lastSynced === currentVersion) {
      // cache hit: nothing has moved since this session synced. Allow the stop
      // WITHOUT calling /deltas (the fast path keeps a clean session frictionless).
      return EXIT_ALLOW;
    }

    const pulled = await getDeltas(busUrl, lastSynced, deadline);
    if (pulled == null) {
      failOpen(datumDir, `bus /deltas unreachable at ${busUrl}`);
      return EXIT_ALLOW;
    }
    deltas = pulled;
  } catch (err) {
    failOpen(datumDir, `bus error: ${errMsg(err)}`);
    return EXIT_ALLOW;
  }

  const fenceInput: FenceInput = {
    write: { path, tool_name: "Stop", content },
    lastSyncedVersion: lastSynced,
    currentVersion,
    deltas,
  };

  let decision: FenceDecision;
  try {
    decision = decideFence(fenceInput);
  } catch (err) {
    // decideFence is pure and should not throw, but never brick the agent.
    failOpen(datumDir, `decideFence threw: ${errMsg(err)}`);
    return EXIT_ALLOW;
  }

  // deny OR inject == an unacknowledged intersecting delta -> BLOCK the stop.
  if (decision.decision === "deny" || decision.decision === "inject") {
    const reason = withRelativeTime(blockReason(decision), deltas);
    // print the block decision on stdout (JSON) AND a human reason on stderr.
    emit({ decision: "block", reason });
    process.stderr.write(`${reason}\n`);
    return EXIT_BLOCK;
  }

  // allow: clean session (or no intersecting delta). exit 0.
  return EXIT_ALLOW;
}

/** The reason text for a block (deny carries it; inject uses additionalContext). */
function blockReason(decision: FenceDecision): string {
  if (decision.decision === "deny") return decision.reason;
  if (decision.decision === "inject") return decision.additionalContext;
  return "unacknowledged delta intersects this session";
}

// ---- fail open ----

function failOpen(datumDir: string, message: string): void {
  try {
    mkdirSync(datumDir, { recursive: true });
    appendFileSync(
      join(datumDir, "warnings.log"),
      `${new Date().toISOString()} guard fail-open: ${message}\n`,
    );
  } catch {
    // even the warning log is best-effort; never throw.
  }
  // returning EXIT_ALLOW at the call site -> the stop proceeds.
}

// ---- bus IO (fetch with a per-call timeout bounded by the total deadline) ----

async function getVersion(busUrl: string, deadline: number): Promise<number | null> {
  const body = await busGet(`${busUrl}/version`, deadline);
  if (!body || typeof body.registry_version !== "number") return null;
  return body.registry_version;
}

async function getDeltas(
  busUrl: string,
  since: number,
  deadline: number,
): Promise<Delta[] | null> {
  const body = await busGet(`${busUrl}/deltas?since=${since}`, deadline);
  if (!body || !Array.isArray(body.deltas)) return null;
  return body.deltas as Delta[];
}

async function busGet(
  url: string,
  deadline: number,
): Promise<Record<string, any> | null> {
  const remaining = deadline - Date.now();
  if (remaining <= 0) return null;
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), remaining);
  try {
    const res = await fetch(url, { signal: ac.signal });
    if (!res.ok) return null;
    return (await res.json()) as Record<string, any>;
  } catch {
    return null; // fail open
  } finally {
    clearTimeout(timer);
  }
}

// ---- relative-time decoration (clock lives in the hook, not in decideFence) ----

function withRelativeTime(reason: string, deltas: Delta[]): string {
  const d = deltas[0];
  if (!d || !d.ts) return reason;
  const dt = Date.parse(d.ts);
  if (!Number.isFinite(dt)) return reason;
  const ago = relativeTime(Date.now() - dt);
  if (!ago) return reason;
  // splice "{author})" -> "{author}, {ago})".
  return reason.replace(/\)\./, `, ${ago}).`);
}

function relativeTime(ms: number): string | null {
  if (!Number.isFinite(ms) || ms < 0) return null;
  const s = Math.round(ms / 1000);
  if (s < 90) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 90) return `${m}m ago`;
  const h = Math.round(m / 60);
  return `${h}h ago`;
}

// ---- state + stdin ----

function readState(datumDir: string): DatumState {
  try {
    const file = join(datumDir, "state.json");
    return JSON.parse(readFileSync(file, "utf8")) as DatumState;
  } catch {
    return {};
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

// Run: `node hooks/datum-guard.ts`. Never throw; always exit via .finally.
const isMain = (() => {
  try {
    return import.meta.url === `file://${resolve(process.argv[1] ?? "")}`;
  } catch {
    return false;
  }
})();

if (isMain) {
  main()
    .then((code) => process.exit(code))
    .catch(() => {
      // last-resort fail open: swallow everything, allow the stop.
      process.exit(EXIT_ALLOW);
    });
}
