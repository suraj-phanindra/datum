// hooks/datum-fence.ts — the PreToolUse hook that calls the deterministic fence
// on every tool call. No model on this path (schema §7/§8). Runnable via:
//   node hooks/datum-fence.ts
//
// Contract (Claude Code PreToolUse, confirmed against the live docs):
//   - reads a PreToolUse JSON envelope on stdin
//     { session_id, cwd, tool_name, tool_input }
//   - loads .datum/state.json (last_synced_version, bus_url)
//   - GET {bus}/version; if behind, GET {bus}/deltas?since=N
//   - builds a FenceInput and calls decideFence
//   - DENY  : print { hookSpecificOutput:{ hookEventName:'PreToolUse',
//             permissionDecision:'deny', permissionDecisionReason } }, exit 0,
//             and POST a write.fenced event to {bus}/events.
//   - INJECT: print { hookSpecificOutput:{ ..., permissionDecision:'allow',
//             additionalContext } }, exit 0.
//   - ALLOW : exit 0, no output.
//
// IMPORTANT: the DENY path is exit 0 + hookSpecificOutput (exit 2 discards the
// JSON). FAIL OPEN: any bus error or a total budget > ~1s -> allow (exit 0) and
// append a line to .datum/warnings.log. The hook NEVER throws.

import { readFileSync, appendFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

import { decideFence, type FenceInput, type FenceDecision } from "../server/fence.ts";
import type { Delta } from "../server/store.ts";
import { runAsEntry } from "../server/entry.ts";

// ~1s total budget for all bus IO; over budget -> fail open (schema §8).
const BUS_BUDGET_MS = 1000;

type PreToolUseInput = {
  session_id?: string;
  cwd?: string;
  tool_name?: string;
  tool_input?: Record<string, unknown>;
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
  let input: PreToolUseInput = {};
  try {
    input = raw ? (JSON.parse(raw) as PreToolUseInput) : {};
  } catch {
    // malformed envelope -> fail open silently.
    return;
  }

  const cwd = input.cwd || process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const datumDir = join(cwd, ".datum");
  const state = readState(datumDir);

  const busUrl =
    state.bus_url || process.env.DATUM_BUS_URL || "http://127.0.0.1:4317";
  const lastSynced = Number(state.last_synced_version ?? 0);

  // Build the write surface from tool_input (schema §7: content = new_string /
  // file_text / command; path = file_path / path).
  const ti = input.tool_input ?? {};
  const content = String(
    (ti.new_string as string | undefined) ??
      (ti.content as string | undefined) ??
      (ti.file_text as string | undefined) ??
      (ti.command as string | undefined) ??
      "",
  );
  const path = String(
    (ti.file_path as string | undefined) ?? (ti.path as string | undefined) ?? "",
  );
  const toolName = input.tool_name ?? "Edit";

  // Bus IO under a strict total budget. Any failure / timeout -> fail open.
  const deadline = Date.now() + BUS_BUDGET_MS;
  let currentVersion: number;
  let deltas: Delta[];
  try {
    const version = await getVersion(busUrl, deadline);
    if (version == null) {
      return failOpen(datumDir, `bus /version unreachable at ${busUrl}`);
    }
    currentVersion = version;

    if (lastSynced === currentVersion) {
      // cache hit: no /deltas call needed; decideFence short-circuits anyway.
      deltas = [];
    } else {
      const pulled = await getDeltas(busUrl, lastSynced, deadline);
      if (pulled == null) {
        return failOpen(datumDir, `bus /deltas unreachable at ${busUrl}`);
      }
      deltas = pulled;
    }
  } catch (err) {
    return failOpen(datumDir, `bus error: ${errMsg(err)}`);
  }

  const fenceInput: FenceInput = {
    write: { path, tool_name: toolName, content },
    lastSyncedVersion: lastSynced,
    currentVersion,
    deltas,
  };

  let decision: FenceDecision;
  try {
    decision = decideFence(fenceInput);
  } catch (err) {
    // decideFence is pure and should not throw, but never brick the agent.
    return failOpen(datumDir, `decideFence threw: ${errMsg(err)}`);
  }

  if (decision.decision === "deny") {
    // The hook may prepend a relative time; decideFence stays clock-free.
    const reason = withRelativeTime(decision.reason, deltas);
    emit({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason: reason,
      },
    });
    // best-effort write.fenced (deny ONLY emits this — schema §3). Never throws.
    await postFenced(busUrl, {
      session_id: input.session_id ?? state.session_id ?? "",
      human: state.human ?? "",
      path,
      delta_epoch: matchedEpoch(deltas, content) ?? currentVersion,
      contract_id: matchedContractId(deltas, content) ?? "",
      reason,
    });
    return; // exit 0
  }

  if (decision.decision === "inject") {
    emit({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "allow",
        additionalContext: decision.additionalContext,
      },
    });
    return; // exit 0
  }

  // allow: no output, exit 0.
}

// ---- fail open ----

function failOpen(datumDir: string, message: string): void {
  try {
    mkdirSync(datumDir, { recursive: true });
    appendFileSync(
      join(datumDir, "warnings.log"),
      `${new Date().toISOString()} fence fail-open: ${message}\n`,
    );
  } catch {
    // even the warning log is best-effort; never throw.
  }
  // no stdout -> the write is allowed.
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

async function postFenced(
  busUrl: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), BUS_BUDGET_MS);
  try {
    await fetch(`${busUrl}/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "write.fenced", ...payload }),
      signal: ac.signal,
    });
  } catch {
    // best-effort; the deny decision already stands.
  } finally {
    clearTimeout(timer);
  }
}

// ---- correlate the fired deny back to a delta (for the write.fenced payload) ----

function matchedDelta(deltas: Delta[], content: string): Delta | undefined {
  // The deny was produced by decideFence; find the delta whose stale symbol the
  // content references (word-boundary), mirroring referencesStaleSymbol.
  for (const d of deltas) {
    const mc = d.mechanical_change;
    const stale =
      mc.kind === "rename_column"
        ? mc.from
        : mc.kind === "drop_column"
          ? mc.column
          : mc.kind === "api_field_renamed" || mc.kind === "api_field_removed"
            ? mc.from
            : undefined;
    if (stale && wordBoundary(content, stale)) return d;
  }
  return deltas[0];
}

function matchedEpoch(deltas: Delta[], content: string): number | undefined {
  return matchedDelta(deltas, content)?.epoch;
}

function matchedContractId(deltas: Delta[], content: string): string | undefined {
  return matchedDelta(deltas, content)?.contract_id;
}

function wordBoundary(content: string, symbol: string): boolean {
  const escaped = symbol.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?<![\\w])${escaped}(?![\\w])`).test(content);
}

// ---- relative-time decoration (clock lives in the hook, not in decideFence) ----

function withRelativeTime(reason: string, deltas: Delta[]): string {
  const d = deltas[0];
  if (!d || !d.ts) return reason;
  const dt = Date.parse(d.ts);
  if (!Number.isFinite(dt)) return reason;
  const ago = relativeTime(Date.now() - dt);
  if (!ago) return reason;
  // splice "{author})" -> "{author}, {ago})" so the reason reads
  // "(migration 0042, asha, 40s ago)."
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

// Run: `node hooks/datum-fence.ts` (dev) or the bundled dist/hooks/datum-fence.js
// (dist). Never throw — always exit 0.
const isMain = runAsEntry(import.meta.url, "fence");

if (isMain) {
  main()
    .catch(() => {
      // last-resort fail open: swallow everything, allow the write.
    })
    .finally(() => process.exit(0));
}
