// server/arbiter/intersect.ts — the deterministic recipient set for the arbiter.
//
// This is a thin re-export/wrap of intersectingSessions from the bus-registry
// substrate (server/registry.ts). The arbiter must NOT reimplement claim
// intersection — the same pure function that the fence/reconcile path uses is
// the single source of truth for "who breaks". The delta's author is excluded
// (a session never advises itself); recipients are returned in input order, so
// the recipient set is deterministic + replay-stable.
//
// No model touches this path.

import { intersectingSessions as registryIntersectingSessions } from "../registry.ts";
import type { Delta, Session } from "../store.ts";

/**
 * intersect — deterministic recipient set for a delta. Wraps
 * intersectingSessions from the registry; identical semantics. Sessions whose
 * claim_files / claim_symbols touch the delta are returned (in input order);
 * the delta's author is excluded.
 */
export function intersect(delta: Delta, sessions: Session[]): Session[] {
  return registryIntersectingSessions(delta, sessions);
}

// Re-export the underlying registry function under its canonical name too, so
// callers can import either spelling from the arbiter surface.
export { intersectingSessions } from "../registry.ts";
