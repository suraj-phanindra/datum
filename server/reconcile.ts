// server/reconcile.ts — server-owned live `reconciled` emission (schema §3,
// RECONCILIATION #1). The bus-registry owns this; self-correction & the drift
// card only consume it.
//
// Model: a session can be fenced against a contract (correlation key =
// session_id + contract_id, NOT path). When a previously-fenced session lands
// a clean edit.streamed whose content no longer references the stale symbol for
// that same contract (referencesStaleSymbol === false), we emit a per-session
// `reconciled` { session_id, human, contract_id, epoch, path }. When ALL
// intersecting consumers of a delta have reconciled, we emit the workspace
// `reconciled` { workspace: true, epoch, sessions: [] }.

import type { Store, Delta, MechanicalChange, Event } from "./store.ts";
import { referencesStaleSymbol } from "./watchlist.ts";
import { intersectingSessions } from "./registry.ts";

// A fence record the reconciler tracks per (session_id + contract_id).
type FenceRecord = {
  sessionId: string;
  human: string;
  contractId: string;
  epoch: number;
  mechanicalChange: MechanicalChange;
};

// Per-contract reconcile tracking for the workspace-level signal.
type DeltaTracking = {
  contractId: string;
  epoch: number;
  // the set of session_ids that intersected the delta (the consumers we wait on)
  expected: Set<string>;
  reconciled: Set<string>;
};

/**
 * Reconciler — holds the in-memory fence + delta tracking. One instance per bus.
 * Pure of any model call; deterministic.
 */
export class Reconciler {
  // keyed by `${sessionId}::${contractId}`
  private fences = new Map<string, FenceRecord>();
  // keyed by contractId (latest delta per contract drives the workspace gate)
  private tracking = new Map<string, DeltaTracking>();

  private store: Store;

  constructor(store: Store) {
    this.store = store;
  }

  private key(sessionId: string, contractId: string): string {
    return `${sessionId}::${contractId}`;
  }

  /**
   * Record that a delta fired: compute its intersecting consumers and mark them
   * as fenced against this contract. Called from the bus right after applyEdit
   * emits a delta. Author is excluded by intersectingSessions.
   */
  onDelta(delta: Delta): void {
    const sessions = this.store.listSessions();
    const consumers = intersectingSessions(delta, sessions);

    const track: DeltaTracking = {
      contractId: delta.contract_id,
      epoch: delta.epoch,
      expected: new Set(consumers.map((c) => c.id)),
      reconciled: new Set(),
    };
    this.tracking.set(delta.contract_id, track);

    for (const c of consumers) {
      this.fences.set(this.key(c.id, delta.contract_id), {
        sessionId: c.id,
        human: c.human,
        contractId: delta.contract_id,
        epoch: delta.epoch,
        mechanicalChange: delta.mechanical_change,
      });
    }
  }

  /**
   * Explicitly mark a session as fenced against a contract (used when a fence
   * is observed out-of-band, e.g. a write.fenced event). Idempotent.
   */
  markFenced(sessionId: string, human: string, contractId: string, epoch: number, mc: MechanicalChange): void {
    this.fences.set(this.key(sessionId, contractId), {
      sessionId,
      human,
      contractId,
      epoch,
      mechanicalChange: mc,
    });
    let track = this.tracking.get(contractId);
    if (!track) {
      track = { contractId, epoch, expected: new Set(), reconciled: new Set() };
      this.tracking.set(contractId, track);
    }
    track.expected.add(sessionId);
  }

  /**
   * Process a clean edit.streamed from a session. If that session was fenced
   * against any contract whose stale symbol is no longer referenced in the new
   * content, emit per-session `reconciled` for each such contract, and the
   * workspace `reconciled` when all expected consumers of that contract are done.
   *
   * Returns the Events emitted (also appended to the store), for the bus to
   * broadcast over SSE.
   */
  onEdit(input: {
    sessionId: string;
    human?: string;
    path: string;
    content: string;
  }): Event[] {
    const emitted: Event[] = [];
    if (!input.sessionId) return emitted;

    // Find every fence this session is under.
    for (const [k, fence] of this.fences) {
      if (fence.sessionId !== input.sessionId) continue;

      // Clean write? content must NO LONGER reference the stale symbol for this
      // contract (correlation by session_id + contract_id, never path).
      if (referencesStaleSymbol(input.content, fence.mechanicalChange)) {
        continue; // still stale -> not reconciled
      }

      // Per-session reconciled. path is carried for the UI only.
      const human = input.human ?? fence.human;
      const perSession = this.store.addEvent("reconciled", {
        session_id: fence.sessionId,
        human,
        contract_id: fence.contractId,
        epoch: fence.epoch,
        path: input.path,
      });
      emitted.push(perSession);

      // advance session status to reconciled.
      const sess = this.store.getSession(fence.sessionId);
      if (sess) {
        this.store.patchSession(fence.sessionId, { status: "reconciled" });
      }

      // clear this fence and record on the contract tracking.
      this.fences.delete(k);
      const track = this.tracking.get(fence.contractId);
      if (track) {
        track.reconciled.add(fence.sessionId);
        // Workspace-level: all expected consumers reconciled?
        const allDone =
          track.expected.size > 0 &&
          [...track.expected].every((id) => track.reconciled.has(id));
        if (allDone) {
          const workspace = this.store.addEvent("reconciled", {
            workspace: true,
            epoch: track.epoch,
            sessions: [...track.reconciled],
          });
          emitted.push(workspace);
          this.tracking.delete(fence.contractId);
        }
      }
    }

    return emitted;
  }

  /** True if the session is currently fenced against the contract. */
  isFenced(sessionId: string, contractId: string): boolean {
    return this.fences.has(this.key(sessionId, contractId));
  }
}
