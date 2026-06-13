// server/registry.ts — turns a streamed edit into a versioned delta.
//
// applyEdit runs classifyEdit; on a contract-relevant edit it bumps the epoch,
// appends a ContractVersion, appends LedgerEntry #112 (asha's rename) from the
// delta's `why`, and emits a `delta.detected` event. Off-watchlist edits do
// neither. intersectingSessions is the deterministic set whose claims touch a
// delta (track C / arbiter imports it).

import type { Store, Delta, Session, ContractVersion, Contract } from "./store.ts";
import { classifyEdit, bumpRegistry } from "./watchlist.ts";
import type { ClassifyResult } from "./watchlist.ts";

// The shape of an `edit.streamed` event payload (schema §3), as it arrives at
// POST /events. snake_case on the wire.
export type StreamedEdit = {
  session_id?: string;
  human?: string;
  tool_name?: string;
  path: string;
  before?: string | null;
  after?: string;
  // some callers carry the new content under `summary`/`content`; `after` wins.
  content?: string;
  summary?: string;
  why?: string; // author-supplied reason for the change, becomes the delta `why`
  ts?: string;
};

export type ApplyEditResult = {
  registry_version: number;
  delta?: Delta;
};

/**
 * applyEdit — classify a streamed edit; if contract-relevant, bump the registry,
 * append a contract version, append the ledger entry, and emit delta.detected.
 * Returns the (possibly bumped) registry_version and the delta when one fired.
 *
 * Note: the caller (bus) is responsible for appending the raw `edit.streamed`
 * event itself; this function owns only the delta side effects.
 */
export function applyEdit(store: Store, edit: StreamedEdit): ApplyEditResult {
  const after = edit.after ?? edit.content ?? edit.summary ?? "";
  const before = edit.before ?? null;

  const result: ClassifyResult = classifyEdit(edit.path, before, after);

  if (!result.contractRelevant) {
    // off-watchlist: no bump, no ledger, no delta (schema §5).
    return { registry_version: store.getVersion() };
  }

  const author = edit.human ?? "asha";
  const ts = edit.ts ?? new Date().toISOString();
  const why = edit.why ?? defaultWhy(result, author);

  // per-contract version: previous current_version + 1 (independent of epoch §1).
  const existing: Contract | undefined = store.getContract(result.contractId);
  const fromVersion = existing ? existing.current_version : 0;
  const toVersion = fromVersion + 1;

  // global epoch bump (+1, monotonic, contract-relevant only).
  const currentEpoch = store.getVersion();
  const epoch = bumpRegistry(currentEpoch, result);
  store.setVersion(epoch);

  // map the in-process camelCase ClassifyResult to the snake_case wire shapes.
  const mechanicalChange = result.mechanicalChange;
  const valueSnapshot = nextValueSnapshot(existing, result);

  // append the per-contract version row.
  const cv: ContractVersion = {
    contract_id: result.contractId,
    version: toVersion,
    epoch,
    author,
    ts,
    why,
    mechanical_change: mechanicalChange,
    value_snapshot: valueSnapshot,
  };
  store.addContractVersion(cv);

  // update / create the current-truth contract row.
  store.upsertContract({
    id: result.contractId,
    name: existing?.name ?? result.contractId,
    type: result.contractType,
    current_version: toVersion,
    current_value: valueSnapshot,
  });

  // Ledger: the delta's `why` becomes the next ledger entry (#112 for asha's
  // rename). Seed loads #110/#111 only, so the first live delta gets id 112.
  store.addLedger({
    ts,
    author,
    description: why,
    contract_id: result.contractId,
  });

  // build the Delta (== delta.detected payload, schema §4) and emit it.
  const delta: Delta = {
    epoch,
    contract_id: result.contractId,
    from_version: fromVersion,
    to_version: toVersion,
    author,
    ts,
    why,
    mechanical_change: mechanicalChange,
  };

  store.addEvent("delta.detected", deltaToPayload(delta));

  return { registry_version: epoch, delta };
}

/** delta.detected payload (snake_case, schema §3). */
export function deltaToPayload(delta: Delta): Record<string, unknown> {
  return {
    epoch: delta.epoch,
    contract_id: delta.contract_id,
    from_version: delta.from_version,
    to_version: delta.to_version,
    author: delta.author,
    ts: delta.ts,
    why: delta.why,
    mechanical_change: delta.mechanical_change,
  };
}

function defaultWhy(result: Extract<ClassifyResult, { contractRelevant: true }>, author: string): string {
  const mc = result.mechanicalChange;
  if (mc.kind === "rename_column") {
    return `rename ${mc.table}.${mc.from} -> ${mc.to}`;
  }
  if (mc.kind === "add_column" || mc.kind === "drop_column") {
    return `${mc.kind} ${mc.table}.${mc.column}`;
  }
  if (mc.kind === "dep_version_changed") {
    return `bump ${mc.dep} ${mc.from} -> ${mc.to}`;
  }
  if (mc.kind === "decision") {
    return mc.text;
  }
  return `${author} contract change on ${result.contractId}`;
}

function nextValueSnapshot(
  existing: Contract | undefined,
  result: Extract<ClassifyResult, { contractRelevant: true }>,
): string {
  // Best-effort structured snapshot. For rename_column, reflect the new column
  // name in a small JSON shape; otherwise carry the mechanical change.
  let base: Record<string, unknown> = {};
  if (existing) {
    try {
      base = JSON.parse(existing.current_value) as Record<string, unknown>;
    } catch {
      base = {};
    }
  }
  const mc = result.mechanicalChange;
  if (mc.kind === "rename_column") {
    const cols = Array.isArray(base.columns) ? (base.columns as string[]) : [];
    const next = cols.map((c) => (c === mc.from ? mc.to : c));
    if (!next.includes(mc.to)) next.push(mc.to);
    return JSON.stringify({ ...base, table: mc.table, columns: next });
  }
  return JSON.stringify({ ...base, lastChange: mc });
}

// ===========================================================================
// intersectingSessions — deterministic claim intersection (arbiter imports).
// ===========================================================================

/**
 * intersectingSessions — the deterministic set of sessions whose claim_files or
 * claim_symbols touch the delta. The delta's author is excluded. Pure + stable
 * (returns sessions in input order).
 *
 * Symbol intersection is the load-bearing one: a session claiming "user.email"
 * or ".email" intersects a rename of users.email. File intersection matches a
 * glob-ish claim ("routes/**", "migrations/**") against the delta scope.
 */
export function intersectingSessions(delta: Delta, sessions: Session[]): Session[] {
  const staleSymbols = deltaSymbols(delta);
  const deltaFiles = deltaFileHints(delta);
  const author = delta.author;

  return sessions.filter((s) => {
    if (s.human === author) return false; // author never advises themselves
    const symbolHit = s.claim_symbols.some((claim) =>
      staleSymbols.some((sym) => symbolsIntersect(claim, sym)),
    );
    const fileHit = s.claim_files.some((claim) =>
      deltaFiles.some((f) => claimMatchesFile(claim, f)),
    );
    return symbolHit || fileHit;
  });
}

/** Symbols implicated by the delta (the renamed/removed column + bare name). */
function deltaSymbols(delta: Delta): string[] {
  const mc = delta.mechanical_change;
  const out = new Set<string>();
  const table = mcTable(mc);
  if (mc.kind === "rename_column") {
    out.add(mc.from);
    if (table) out.add(`${table}.${mc.from}`);
    out.add(`.${mc.from}`);
  } else if (mc.kind === "drop_column") {
    out.add(mc.column);
    if (table) out.add(`${table}.${mc.column}`);
    out.add(`.${mc.column}`);
  } else if (mc.kind === "api_field_renamed" || mc.kind === "api_field_removed") {
    if (mc.from) {
      out.add(mc.from);
      out.add(`.${mc.from}`);
    }
  }
  return [...out];
}

function mcTable(mc: Delta["mechanical_change"]): string | null {
  if (mc.kind === "rename_column" || mc.kind === "add_column" || mc.kind === "drop_column") {
    return mc.table;
  }
  return null;
}

/** File hints from the delta (migration path, contract id table). */
function deltaFileHints(delta: Delta): string[] {
  const hints: string[] = [];
  const mc = delta.mechanical_change;
  if ("migration" in mc && mc.migration) hints.push(`migrations/${mc.migration}`);
  if (delta.contract_id.startsWith("db.")) hints.push("schema.sql", "migrations/");
  return hints;
}

/**
 * Two symbol claims intersect if either is a suffix/property form of the other
 * on a word boundary. e.g. "user.email" vs "email", ".email" vs "email".
 */
function symbolsIntersect(a: string, b: string): boolean {
  const na = normalizeSymbol(a);
  const nb = normalizeSymbol(b);
  if (na === nb) return true;
  // property suffix match: "user.email" tail == "email"
  return tailSegment(na) === tailSegment(nb);
}

function normalizeSymbol(s: string): string {
  return s.trim().replace(/^\.+/, "");
}

function tailSegment(s: string): string {
  const parts = s.split(".");
  return parts[parts.length - 1];
}

/** A claim file glob (light) matching a delta file hint. */
function claimMatchesFile(claim: string, file: string): boolean {
  const c = claim.replace(/\*+/g, "").replace(/\/$/, "");
  const f = file.replace(/\/$/, "");
  if (c === "" ) return false;
  return f.includes(c) || c.includes(f);
}
