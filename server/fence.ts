// server/fence.ts — the deterministic fence (schema §7). The single most
// important unit under test: a PURE function, no model, no IO, no Date.now().
//
// decideFence(input) -> { decision:"allow" } | { decision:"inject", additionalContext }
//                       | { decision:"deny", reason }
//
// Precedence: deny > inject > allow. The fast path (lastSyncedVersion ===
// currentVersion) returns allow WITHOUT consulting deltas — this is the cache
// hit that keeps steady state at ~0 HTTP and <50ms (RUBRIC line 25).
//
// Casing: Delta is the snake_case `delta.detected` wire shape (schema §3/§4);
// its `mechanical_change` field is consumed directly. referencesStaleSymbol does
// the WORD-BOUNDARY match so "contact_email" is never re-fenced by "email".

import type { Delta, MechanicalChange } from "./store.ts";
import { referencesStaleSymbol } from "./watchlist.ts";

// ---- schema §7 types ----

export type FenceInput = {
  write: { path: string; tool_name: string; content: string };
  lastSyncedVersion: number; // from local .datum state
  currentVersion: number; // from bus (cache hit avoids HTTP)
  deltas: Delta[]; // deltas with epoch in (lastSyncedVersion, currentVersion]
};

export type FenceDecision =
  | { decision: "allow" }
  | { decision: "inject"; additionalContext: string }
  | { decision: "deny"; reason: string };

/**
 * decideFence — the deterministic heart. Pure, deterministic, no IO.
 *
 * Algorithm (schema §7):
 *   1. lastSyncedVersion === currentVersion -> allow (fast path; do NOT touch deltas).
 *   2. else, for each delta:
 *        - stale-symbol hit  -> deny  (content references a renamed-away/removed symbol)
 *        - area hit, no hit  -> inject (write touches the delta's scope but no stale symbol)
 *        - no intersection   -> allow
 *   3. precedence: deny > inject > allow.
 *
 * The hook may prepend a relative time ("40s ago"); decideFence stays pure and
 * never reads the clock, so the unit test is deterministic.
 */
export function decideFence(input: FenceInput): FenceDecision {
  // 1) cache-hit fast path — nothing has changed since this session synced.
  //    Returns allow WITHOUT consulting deltas, even if a stale delta is passed.
  if (input.lastSyncedVersion === input.currentVersion) {
    return { decision: "allow" };
  }

  const { content, path } = input.write;
  const tool = input.write.tool_name || "Edit";

  let injectDecision: FenceDecision | null = null;

  // 2) intersect each delta with the write. deny wins immediately.
  for (const delta of input.deltas) {
    const mc = delta.mechanical_change;

    // stale-symbol hit -> deny. Word-boundary match (so contact_email != email).
    if (referencesStaleSymbol(content, mc)) {
      return { decision: "deny", reason: denyReason(delta, mc, tool) };
    }

    // area hit, no direct conflict -> remember an inject (only the first one).
    if (injectDecision == null && writeInDeltaScope(path, delta, mc)) {
      injectDecision = {
        decision: "inject",
        additionalContext: injectContext(delta, mc),
      };
    }
  }

  // 3) precedence: deny already returned; inject beats allow.
  if (injectDecision) return injectDecision;
  return { decision: "allow" };
}

// ---- deny reason (schema §7 / RUBRIC line 18) ----
//
// Names: the contract_id, the mechanical change ("email -> contact_email"), the
// migration (0042), the author (asha), and the imperative "Re-sync to v{epoch}
// and use contact_email". The hook may prepend a relative time; this string is
// clock-free so the unit test is deterministic.

function denyReason(delta: Delta, mc: MechanicalChange, tool: string): string {
  const fromTo = mechanicalChangeText(mc);
  const stale = staleSymbol(mc);
  const to = renamedTo(mc);
  const migration =
    "migration" in mc && mc.migration ? `migration ${mc.migration}, ` : "";
  // e.g. "db.users.email was renamed to contact_email (migration 0042, asha).
  //       This Edit references .email and will break. Re-sync to v8 and use
  //       contact_email."
  const head = `${delta.contract_id}.${fromTo} (${migration}${delta.author}).`;
  const ref = stale ? ` This ${tool} references .${stale} and will break.` : "";
  const imperative = to
    ? ` Re-sync to v${delta.epoch} and use ${to}.`
    : ` Re-sync to v${delta.epoch}.`;
  return `${head}${ref}${imperative}`;
}

/** The human "email -> contact_email" change phrase for the reason head. */
function mechanicalChangeText(mc: MechanicalChange): string {
  switch (mc.kind) {
    case "rename_column":
      return `${mc.from} was renamed to ${mc.to}`;
    case "drop_column":
      return `${mc.column} was removed`;
    case "api_field_renamed":
      return mc.from && mc.to
        ? `${mc.from} was renamed to ${mc.to}`
        : `field changed on ${mc.route}`;
    case "api_field_removed":
      return mc.from ? `${mc.from} was removed` : `field removed on ${mc.route}`;
    default:
      return "surface changed";
  }
}

/** The symbol that became stale (renamed-away / removed), if any. */
function staleSymbol(mc: MechanicalChange): string | null {
  switch (mc.kind) {
    case "rename_column":
      return mc.from;
    case "drop_column":
      return mc.column;
    case "api_field_renamed":
    case "api_field_removed":
      return mc.from ?? null;
    default:
      return null;
  }
}

/** The replacement symbol to migrate to, if any. */
function renamedTo(mc: MechanicalChange): string | null {
  switch (mc.kind) {
    case "rename_column":
      return mc.to;
    case "api_field_renamed":
      return mc.to ?? null;
    default:
      return null;
  }
}

// ---- inject context (area hit, no direct conflict — schema §7) ----

function injectContext(delta: Delta, mc: MechanicalChange): string {
  const change = mechanicalChangeText(mc);
  return (
    `Heads up: ${delta.contract_id}.${change} (epoch v${delta.epoch}, ${delta.author}). ` +
    `Your write touches this contract's surface. Re-sync to v${delta.epoch} before relying on the old shape.`
  );
}

// ---- area intersection (file/module scope of the delta) ----
//
// "Area hit" = the write's path is within the delta's affected scope (its
// contract's file region) but the content references no stale symbol. We map a
// delta to its likely file scope deterministically.

function writeInDeltaScope(path: string, delta: Delta, mc: MechanicalChange): boolean {
  if (!path) return false;
  const p = path.toLowerCase();

  // db_schema deltas (rename/add/drop_column): migrations/** and schema.sql.
  if (
    mc.kind === "rename_column" ||
    mc.kind === "add_column" ||
    mc.kind === "drop_column"
  ) {
    if (/(^|\/)migrations\//.test(p)) return true;
    if (/(^|\/)schema\.sql$/.test(p)) return true;
    // a routes file referencing the table's surface by name (e.g. routes/users.ts
    // for db.users) is in-area even when the stale column itself is absent.
    const table = mc.table?.toLowerCase();
    if (table && p.includes(table)) return true;
    return false;
  }

  // api_shape deltas: routes/**, *.controller.ts, openapi.*, trpc routers.
  if (mc.kind === "api_field_renamed" || mc.kind === "api_field_removed") {
    if (/(^|\/)routes\//.test(p)) return true;
    if (/\.controller\.ts$/.test(p)) return true;
    if (/(^|\/)openapi\./.test(p)) return true;
    return false;
  }

  // dep_version / decision deltas have no narrow write-scope: no inject.
  return false;
}
