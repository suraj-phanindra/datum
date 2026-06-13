#!/usr/bin/env node
// demo/seed-snapshot.ts — generate web/snapshot.json: the seeded v8 end-state the
// DEPLOYED tower hydrates from when NO live bus is reachable (deploy PRD).
//
//   node demo/seed-snapshot.ts        (regenerates web/snapshot.json)
//
// The snapshot is a VERBATIM serialization of the same schema §4 surfaces the
// tower consumes locally, produced by driving the REAL deterministic path on an
// in-memory bus (one bus, one store) so the bytes are honest, not hand-authored:
//
//   1. seedScenario(store)              -> epoch 7, db.users v7, ledger #110/#111
//   2. POST asha's migration            -> applyEdit bumps 7->8 + delta.detected
//   3. decideFence(ben stale .email)    -> DENY -> emit EXACTLY ONE write.fenced
//   4. runArbiter (offline fixture)     -> two advisory.delivered (ben/chen)
//   5. ben + chen corrected writes      -> server reconciled x2 + workspace
//   6. openSpecPR(delta, #112, local)   -> one spec.pr.opened #14 (docs/spec.md)
//
// then serialize:
//   snapshot = {
//     registry: <GET /registry>     (registry_version 8 + the 4 Contract rows),
//     deltas:   <GET /deltas?since=0>,
//     events:   <the frozen replay: delta.detected, write.fenced,
//               advisory.delivered x2, reconciled x2 + workspace, spec.pr.opened #14>,
//     ledger:   [#112, #111, #110]   (newest first),
//   }
//
// Deterministic + re-runnable (in-memory bus, offline fixture advisories, local
// spec-pr artifact). Node built-ins only. RECONCILIATION gate 3: this is
// regenerated only after the arbiter + spec-pr event payloads are frozen; the
// check on registry_version === 8 + all six event types lives in test/deploy.test.ts.

import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { createBus } from "../server/bus.ts";
import { seedScenario } from "../server/seed.ts";
import { decideFence } from "../server/fence.ts";
import { runArbiter } from "../server/arbiter/index.ts";
import type { Advisory, ModelClient } from "../server/arbiter/advise.ts";
import type { PromptPayload } from "../server/arbiter/prompt.ts";
import { openSpecPR } from "../server/arbiter/spec-pr.ts";
import { Reconciler } from "../server/reconcile.ts";
import type { Delta, Store, Event, Contract } from "../server/store.ts";

import { buildWorkspaceRepo } from "./seed.ts";
import {
  SESSION_IDS,
  ASHA_MIGRATION_PATH,
  ASHA_EDIT_AFTER,
  ASHA_EDIT_WHY,
  BEN_SELF_CORRECTION,
  CHEN_RECONCILE,
} from "./scenario.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const SNAPSHOT_PATH = join(HERE, "..", "web", "snapshot.json");
const LEDGER_ID = 112;

// The serialized shape the tower hydrates window.__DATUM__ from (deploy PRD).
export type DatumSnapshot = {
  registry: { registry_version: number; contracts: Contract[] };
  deltas: Delta[];
  events: Event[];
  ledger: Array<{ id: number; ts: string; author: string; description: string; contract_id?: string }>;
};

// ---- offline, deterministic advisory fixture (schema §6 verbatim bodies) ----
// Mirrors datum-demo.ts's FIXTURE_BODY so the frozen replay is byte-stable and
// needs no network / `claude` CLI. The two bodies DIFFER and each names the
// recipient's file (RUBRIC).
const FIXTURE_BODY: Record<string, { body: string; actions: string[] }> = {
  ben: {
    body: "users.email is now contact_email (migration 0042, asha). Your open diff selects .email in two queries; update both before your next write.",
    actions: ["update both .email queries to contact_email", "re-sync to v8"],
  },
  chen: {
    body: "UserDTO.email renamed; regenerate types from the API client. UserCard.tsx line 18 reads user.email and will break at runtime.",
    actions: [
      "regenerate DTO types from the API client",
      "read user.contact_email in UserCard.tsx",
      "re-sync to v8",
    ],
  },
};

function fixtureClient(): ModelClient {
  return async (prompt: PromptPayload): Promise<string> => {
    const text = prompt.messages.map((m) => m.content.map((b) => b.text).join("\n")).join("\n");
    const recipient = /RECIPIENT:\s*(\w+)/.exec(text)?.[1] ?? "ben";
    const f = FIXTURE_BODY[recipient] ?? FIXTURE_BODY.ben;
    return JSON.stringify(f);
  };
}

// ---- small HTTP helpers against the ephemeral bus ----

async function busPost(busUrl: string, path: string, body: unknown): Promise<Record<string, unknown>> {
  const res = await fetch(`${busUrl}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return (await res.json()) as Record<string, unknown>;
}

async function busGet(busUrl: string, path: string): Promise<Record<string, unknown>> {
  const res = await fetch(`${busUrl}${path}`);
  return (await res.json()) as Record<string, unknown>;
}

function fromDeltaPayload(p: Record<string, unknown>): Delta {
  return {
    epoch: Number(p.epoch),
    contract_id: String(p.contract_id),
    from_version: Number(p.from_version),
    to_version: Number(p.to_version),
    author: String(p.author),
    ts: String(p.ts),
    why: String(p.why),
    mechanical_change: p.mechanical_change as Delta["mechanical_change"],
  };
}

// The honest §9 lifecycle wall times for each replay event type (the seeded
// timeline: detected 14:02:11, fenced +5.8s, advised +6.4s, both reconciled by
// 14:03:40, spec PR 14:04). Frozen here so the committed snapshot is byte-stable.
const REPLAY_TS: Record<string, string> = {
  "delta.detected": "2026-06-13T14:02:11Z",
  "write.fenced": "2026-06-13T14:02:17Z",
  "advisory.delivered": "2026-06-13T14:02:18Z",
  "reconciled": "2026-06-13T14:03:40Z",
  "spec.pr.opened": "2026-06-13T14:04:00Z",
};

/**
 * Normalize the replay for deterministic, byte-stable committed bytes: stamp each
 * event row's `ts` from the §9 lifecycle (presentation-neutral — the tower reads
 * payload fields, never the row ts) and rewrite the spec.pr.opened `url` from the
 * machine-specific absolute file:// path to a stable host-relative artifact ref.
 * Mutates `events` in place.
 */
function freezeReplay(events: Event[]): void {
  for (const e of events) {
    const frozen = REPLAY_TS[e.type];
    if (frozen) e.ts = frozen;
    if (e.type === "spec.pr.opened") {
      const p = e.payload as { url?: string };
      if (typeof p.url === "string" && p.url.startsWith("file://")) {
        p.url = ".datum-pr/spec-v8.patch"; // host-relative artifact ref (honest, path-free)
      }
    }
  }
}

/**
 * buildSnapshot — drive the full lifecycle on an in-memory bus and return the
 * serializable snapshot. Exported so the deploy test can (re)generate it without
 * shelling out. The bus is always closed before returning.
 */
export async function buildSnapshot(repoDir?: string): Promise<DatumSnapshot> {
  const bus = await createBus({ port: 0, dbPath: ":memory:" });
  const busUrl = bus.url;
  const store: Store = bus.store;

  try {
    seedScenario(store);

    // ===== 1) asha migrates -> epoch 7 -> 8 + delta.detected =====
    // Pass the honest §9 demo wall time (14:02:11) so the delta/ledger #112 ts is
    // deterministic and matches the seeded timeline the tower renders (14:02),
    // rather than a non-reproducible new Date().
    const ashaResp = await busPost(busUrl, "/events", {
      type: "edit.streamed",
      payload: {
        session_id: SESSION_IDS.asha,
        human: "asha",
        tool_name: "Write",
        path: ASHA_MIGRATION_PATH,
        after: ASHA_EDIT_AFTER,
        why: ASHA_EDIT_WHY,
        ts: "2026-06-13T14:02:11Z",
      },
    });
    const deltaPayload = ashaResp.delta as Record<string, unknown> | undefined;
    if (!deltaPayload) throw new Error("seed-snapshot: asha's migration produced no delta");
    const delta = fromDeltaPayload(deltaPayload);

    // ===== 2) ben's stale .email write -> decideFence DENY -> ONE write.fenced =====
    const deltasResp = await busGet(busUrl, `/deltas?since=7`);
    const deltas = ((deltasResp.deltas as Delta[]) ?? []).map((d) => d);
    const decision = decideFence({
      write: {
        path: BEN_SELF_CORRECTION.path,
        tool_name: "Edit",
        content: BEN_SELF_CORRECTION.staleContent,
      },
      lastSyncedVersion: 7,
      currentVersion: 8,
      deltas,
    });
    if (decision.decision !== "deny") {
      throw new Error(`seed-snapshot: expected ben's stale write to be DENIED, got ${decision.decision}`);
    }
    await busPost(busUrl, "/events", {
      type: "write.fenced",
      payload: {
        session_id: SESSION_IDS.ben,
        human: "ben",
        path: BEN_SELF_CORRECTION.path,
        delta_epoch: delta.epoch,
        contract_id: delta.contract_id,
        reason: decision.reason,
      },
    });

    // ===== 3) arbiter (offline fixture) -> two advisory.delivered that DIFFER =====
    const advisories: Advisory[] = await runArbiter(store, delta, { modelClient: fixtureClient() });
    if (advisories.length !== 2) {
      throw new Error(`seed-snapshot: expected 2 advisories, got ${advisories.length}`);
    }

    // ===== 4) ben + chen corrected writes -> server reconciled x2 + workspace =====
    // Drive the SERVER-OWNED Reconciler directly (server/reconcile.ts, the same
    // class the bus uses internally) rather than re-POSTing the corrected writes
    // as edit.streamed. Re-running applyEdit on ben's routes/users.ts would
    // classify it as an api_shape surface and bump the epoch to 9 (+ a spurious
    // api.* contract / ledger row) — the deploy end-state must read registry v8
    // with exactly the four seeded contracts. The reconcile correlation key is
    // session_id + contract_id (never path), so this is the honest server path
    // for the reconcile signal; the per-session `reconciled` still carries the
    // recipient's `path` for the drift-card UI.
    const reconciler = new Reconciler(store);
    reconciler.onDelta(delta);
    const benReconciled = reconciler.onEdit({
      sessionId: SESSION_IDS.ben,
      human: "ben",
      path: BEN_SELF_CORRECTION.path,
      content: BEN_SELF_CORRECTION.correctedContent,
    });
    const chenReconciled = reconciler.onEdit({
      sessionId: SESSION_IDS.chen,
      human: "chen",
      path: CHEN_RECONCILE.path,
      content: CHEN_RECONCILE.correctedContent,
    });
    const reconciledEvents = [...benReconciled, ...chenReconciled];
    const workspaceReconciled = reconciledEvents.some(
      (e) => (e.payload as { workspace?: boolean }).workspace === true,
    );
    if (reconciledEvents.length !== 3 || !workspaceReconciled) {
      throw new Error(
        `seed-snapshot: expected 2 per-session + 1 workspace reconciled, got ${reconciledEvents.length} (workspace=${workspaceReconciled})`,
      );
    }

    // ===== 5) openSpecPR -> one spec.pr.opened #14 patching docs/spec.md =====
    const repo = buildWorkspaceRepo(repoDir);
    const pr = await openSpecPR(delta, LEDGER_ID, {
      repoDir: repo.dir,
      specPath: "docs/spec.md",
      useGh: false,
      // route the spec.pr.opened event through the bus so it lands in the SAME
      // event log we serialize below (one source of truth for the replay).
      busUrl,
    });
    if (pr.pr_number !== 14) {
      throw new Error(`seed-snapshot: expected spec PR #14, got #${pr.pr_number}`);
    }

    // ===== serialize the frozen end-state off the live store =====
    const registry = (await busGet(busUrl, "/registry")) as { registry_version: number; contracts: Contract[] };
    const deltasOut = ((await busGet(busUrl, "/deltas?since=0")).deltas as Delta[]) ?? [];

    // the frozen event replay, in bus order. We keep only the lifecycle types the
    // drift-card state machine consumes (schema §3): delta.detected, write.fenced,
    // advisory.delivered x2, reconciled x2 (+ workspace), spec.pr.opened. The raw
    // edit.streamed / claim frames are scaffolding and are NOT part of the replay.
    const REPLAY_TYPES = new Set([
      "delta.detected",
      "write.fenced",
      "advisory.delivered",
      "reconciled",
      "spec.pr.opened",
    ]);
    const events = store.getEventsSince(0).filter((e) => REPLAY_TYPES.has(e.type));

    // DETERMINISM: freeze the per-row event `ts` to the honest §9 lifecycle wall
    // times so the committed snapshot.json is byte-stable across machines/runs
    // (store.addEvent stamps each row with new Date(); that wall clock is the
    // only source of variance). The tower renders payload fields, never the
    // event-row ts, so this is a presentation-neutral normalization. The
    // spec.pr.opened URL is the only other machine-specific value (an absolute
    // file:// path to the local artifact) — rewrite it to a stable, host-relative
    // reference so the artifact identity is honest without leaking a local path.
    freezeReplay(events);

    // ledger newest-first: #112 (live, asha's rename), #111, #110.
    const ledger = store.listLedger().map((l) => ({
      id: l.id,
      ts: l.ts,
      author: l.author,
      description: l.description,
      ...(l.contract_id ? { contract_id: l.contract_id } : {}),
    }));

    return {
      registry: { registry_version: registry.registry_version, contracts: registry.contracts },
      deltas: deltasOut,
      events,
      ledger,
    };
  } finally {
    await bus.close();
  }
}

/** Write the snapshot to web/snapshot.json (pretty, trailing newline). */
export function writeSnapshot(snapshot: DatumSnapshot, path: string = SNAPSHOT_PATH): void {
  writeFileSync(path, JSON.stringify(snapshot, null, 2) + "\n");
}

// Run directly: `node demo/seed-snapshot.ts`
const isMain = (() => {
  try {
    return import.meta.url === `file://${process.argv[1]}`;
  } catch {
    return false;
  }
})();

if (isMain) {
  buildSnapshot()
    .then((snapshot) => {
      writeSnapshot(snapshot);
      const fenced = snapshot.events.filter((e) => e.type === "write.fenced").length;
      const advised = snapshot.events.filter((e) => e.type === "advisory.delivered").length;
      const reconciled = snapshot.events.filter((e) => e.type === "reconciled").length;
      const specPr = snapshot.events.filter((e) => e.type === "spec.pr.opened").length;
      // eslint-disable-next-line no-console
      console.log(
        `wrote ${SNAPSHOT_PATH}\n` +
          `  registry_version: ${snapshot.registry.registry_version}\n` +
          `  contracts: ${snapshot.registry.contracts.length}\n` +
          `  events: ${snapshot.events.length} (fenced=${fenced}, advised=${advised}, reconciled=${reconciled}, spec.pr.opened=${specPr})\n` +
          `  ledger: ${snapshot.ledger.map((l) => "#" + l.id).join(", ")}`,
      );
    })
    .catch((err) => {
      // eslint-disable-next-line no-console
      console.error("seed-snapshot failed:", err && (err as Error).message ? (err as Error).message : err);
      process.exit(1);
    });
}
