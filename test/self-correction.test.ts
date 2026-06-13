// test/self-correction.test.ts — the agent self-correction acceptance test.
//
//   node --test test/self-correction.test.ts
//
// Formalizes the RUBRIC line: "A fenced agent reads the reason and self-corrects
// on its next action with no human input." Self-correction owns ONLY this file;
// the deny-reason copy is fence-owned (decideFence) and the ben two-step scenario
// data lives in demo/scenario.ts (referenced, not forked).
//
//   (a) decideFence on ben's stale `.email` write (lastSyncedVersion 7,
//       currentVersion 8, deltas = the users.email->contact_email rename) -> DENY.
//       The reason is the agent's self-correction INPUT: it names db.users, email,
//       contact_email, and asha (RUBRIC line 18). No human types this.
//   (b) decideFence on ben's NEXT write using `contact_email` (same versions /
//       deltas) -> ALLOW. The self-corrected write passes the fence; no human
//       input was injected between the two calls.
//   (c) END-TO-END on a real ephemeral bus: startBus + seedScenario (epoch 7);
//       applyEdit asha's migration -> epoch 8; emit a write.fenced for sess-ben;
//       then POST an edit.streamed for sess-ben on routes/users.ts whose content
//       uses contact_email (the corrected write). Assert the server emits a
//       per-session `reconciled` for sess-ben (correlation key session_id +
//       contract_id), and that across the whole run there is EXACTLY ONE
//       write.fenced followed by a reconciled for sess-ben. No human input is
//       simulated anywhere.
//
// No model call is on any of these paths.

import { test } from "node:test";
import assert from "node:assert/strict";

import { decideFence, type FenceInput } from "../server/fence.ts";
import { startBus } from "../server/index.ts";
import { Store } from "../server/store.ts";
import { applyEdit } from "../server/registry.ts";
import {
  seedScenario,
  ASHA_MIGRATION_AFTER,
  ASHA_WHY,
} from "../server/seed.ts";
import { openDb } from "../server/db.ts";
import type { Delta } from "../server/store.ts";
// Reference (do NOT fork) the ben two-step scenario data owned by demo-runner.
import {
  BEN_SELF_CORRECTION,
  SESSION_IDS,
  ASHA_MIGRATION_PATH,
} from "../demo/scenario.ts";

// The hero delta ben is behind on: db.users v7 -> v8, users.email ->
// contact_email, migration 0042, author asha. This is the `delta.detected`
// payload shape (schema §3/§4) the fence consumes.
const ASHA_DELTA: Delta = {
  epoch: 8,
  contract_id: "db.users",
  from_version: 7,
  to_version: 8,
  author: "asha",
  ts: "2026-06-13T14:02:11Z",
  why: ASHA_WHY,
  mechanical_change: {
    kind: "rename_column",
    table: "users",
    from: "email",
    to: "contact_email",
    migration: "0042",
  },
};

// ---------------------------------------------------------------------------
// (a) the deny — the agent's self-correction INPUT.
// ---------------------------------------------------------------------------

test("self-correction (a): ben's stale `.email` write -> DENY; reason names db.users, email, contact_email, asha", () => {
  const input: FenceInput = {
    write: {
      path: BEN_SELF_CORRECTION.path, // routes/users.ts
      tool_name: "Edit",
      content: BEN_SELF_CORRECTION.staleContent, // still SELECTs `.email`
    },
    lastSyncedVersion: 7, // behind by one epoch
    currentVersion: 8,
    deltas: [ASHA_DELTA],
  };

  const decision = decideFence(input);
  assert.equal(decision.decision, "deny");
  if (decision.decision !== "deny") return; // narrow for TS

  // The reason IS the self-correction payload. RUBRIC line 18: it names the
  // contract, the mechanical change (email -> contact_email), and the author.
  assert.match(decision.reason, /db\.users/, "reason names the contract");
  assert.match(decision.reason, /email/, "reason names the stale symbol");
  assert.match(decision.reason, /contact_email/, "reason names the new symbol");
  assert.match(decision.reason, /asha/, "reason names the author");
});

// ---------------------------------------------------------------------------
// (b) the self-corrected NEXT write — passes the fence, no human input.
// ---------------------------------------------------------------------------

test("self-correction (b): ben's NEXT write using contact_email (same versions/deltas) -> ALLOW", () => {
  const input: FenceInput = {
    write: {
      path: BEN_SELF_CORRECTION.path, // same file, same epoch gap
      tool_name: "Edit",
      content: BEN_SELF_CORRECTION.correctedContent, // now SELECTs contact_email
    },
    lastSyncedVersion: 7,
    currentVersion: 8,
    deltas: [ASHA_DELTA],
  };

  const decision = decideFence(input);
  // The corrected write no longer references the stale `.email` symbol, so the
  // fence PASSES it (no human input was added between (a) and (b)). Word boundary:
  // "contact_email" is never matched by the stale "email" symbol, so the write is
  // never re-DENIED — that is the self-correction success condition.
  //
  // The deterministic fence returns `inject` (not bare `allow`) here, because
  // routes/users.ts is inside db.users's contract area: a clean write that still
  // touches the moved surface gets the mechanical delta injected as context
  // rather than a hard deny. Both `allow` and `inject` PERMIT the write (only
  // `deny` blocks it), so the load-bearing assertion is "not denied" — matching
  // the fence's own acceptance test for this exact corrected content.
  assert.notEqual(decision.decision, "deny", "the self-corrected write is not re-fenced");
  assert.ok(
    decision.decision === "allow" || decision.decision === "inject",
    "the self-corrected write passes the fence (allow or inject, never deny)",
  );
});

// ---------------------------------------------------------------------------
// (c) end-to-end on a real ephemeral bus: fence-then-reconcile for sess-ben.
// ---------------------------------------------------------------------------

async function jpost(url: string, body: unknown): Promise<{ status: number; body: any }> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
}

// An event as broadcast over SSE (the server's real emission path): the frame
// carries the full Event { id, type, payload, ts }.
type StreamedEvent = { id: number; type: string; payload: Record<string, unknown>; ts: string };

/**
 * Subscribe to GET /stream and collect every broadcast event until ac is
 * aborted. This observes the SERVER's real emission path (the same broadcast the
 * tower consumes) — never an in-process store handle.
 */
function subscribeStream(busUrl: string, ac: AbortController, sink: StreamedEvent[]): Promise<void> {
  return (async () => {
    const res = await fetch(`${busUrl}/stream`, { signal: ac.signal });
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let idx;
        while ((idx = buf.indexOf("\n\n")) !== -1) {
          const frame = buf.slice(0, idx);
          buf = buf.slice(idx + 2);
          const dataLine = frame.split("\n").find((l) => l.startsWith("data: "));
          if (dataLine) {
            try {
              sink.push(JSON.parse(dataLine.slice(6)) as StreamedEvent);
            } catch {
              /* ignore non-json frames (e.g. the retry: hint) */
            }
          }
        }
      }
    } catch {
      /* aborted */
    }
  })();
}

test("self-correction (c): end-to-end — exactly one write.fenced then a reconciled for sess-ben, no human input", async () => {
  // 1) seed a file db to the pre-delta state (epoch 7, db.users v7), then start
  //    the bus on it (ephemeral port). startBus opens its own db, so we seed a
  //    file db first and point the bus at it.
  const fs = await import("node:fs");
  const os = await import("node:os");
  const path = await import("node:path");

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "datum-selfcorrect-"));
  const dbPath = path.join(dir, "datum.db");
  const seedDb = openDb(dbPath);
  seedScenario(new Store(seedDb));
  seedDb.close();

  const bus = await startBus({ port: 0, dbPath });

  // Observe the server's real broadcast path (the same SSE the tower consumes).
  const events: StreamedEvent[] = [];
  const ac = new AbortController();
  const streamDone = subscribeStream(bus.url, ac, events);
  // give the SSE subscription a beat to attach before we post.
  await new Promise((r) => setTimeout(r, 50));

  try {
    // epoch 7 at the start (seed loaded).
    const v0 = await fetch(`${bus.url}/version`).then((r) => r.json());
    assert.equal(v0.registry_version, 7, "seed loaded at epoch 7");

    // 2) asha's migration -> epoch 8, delta.detected. This is asha's own action;
    //    it fences ben + chen server-side (their claims intersect db.users).
    const apply = await jpost(`${bus.url}/events`, {
      type: "edit.streamed",
      session_id: SESSION_IDS.asha,
      human: "asha",
      tool_name: "Write",
      path: ASHA_MIGRATION_PATH,
      after: ASHA_MIGRATION_AFTER,
      why: ASHA_WHY,
    });
    assert.equal(apply.body.registry_version, 8, "asha's migration bumped epoch 7 -> 8");
    assert.equal(apply.body.delta?.contract_id, "db.users");

    // 3) the fence: emit a single write.fenced for sess-ben (the PreToolUse deny
    //    the hook surfaces). This is the ONE fence of the run.
    const fenced = await jpost(`${bus.url}/events`, {
      type: "write.fenced",
      session_id: SESSION_IDS.ben,
      human: "ben",
      path: BEN_SELF_CORRECTION.path,
      delta_epoch: 8,
      contract_id: "db.users",
      reason:
        "db.users.email was renamed to contact_email (migration 0042, asha). " +
        "Re-sync to v8 and use contact_email.",
    });
    assert.equal(fenced.status, 200);

    // 4) the self-corrected NEXT write: ben streams an edit.streamed on the SAME
    //    file using contact_email (no stale symbol). No human input is simulated;
    //    the corrected content is the scripted contact_email write from scenario.ts.
    const corrected = await jpost(`${bus.url}/events`, {
      type: "edit.streamed",
      session_id: SESSION_IDS.ben,
      human: "ben",
      tool_name: "Edit",
      path: BEN_SELF_CORRECTION.path,
      after: BEN_SELF_CORRECTION.correctedContent,
    });
    assert.equal(corrected.status, 200);
    // The corrected write is on routes/users.ts (an api_shape watchlist path), so
    // the server records it as its own surface edit — the epoch advances past 8.
    // What matters for self-correction is the RECONCILE below, not the epoch.
    assert.ok(corrected.body.registry_version >= 8, "the corrected write round-trips cleanly");

    // 5) drain the SSE stream and assert the server emitted a per-session
    //    `reconciled` for sess-ben (correlation key = session_id + contract_id).
    await new Promise((r) => setTimeout(r, 80)); // let the stream flush
    ac.abort();
    await streamDone.catch(() => {});
    const allEvents = events;

    const benReconciled = allEvents.filter(
      (e) =>
        e.type === "reconciled" &&
        (e.payload as { workspace?: boolean }).workspace !== true &&
        (e.payload as { session_id?: string }).session_id === SESSION_IDS.ben,
    );
    assert.equal(benReconciled.length, 1, "server emitted exactly one per-session reconciled for sess-ben");

    // correlation key is session_id + contract_id (path rides along for UI only).
    const recPayload = benReconciled[0].payload as {
      session_id: string;
      contract_id: string;
      epoch: number;
      path?: string;
    };
    assert.equal(recPayload.session_id, SESSION_IDS.ben);
    assert.equal(recPayload.contract_id, "db.users", "reconcile correlated by contract_id");
    assert.equal(recPayload.epoch, 8);

    // 6) EXACTLY ONE write.fenced for sess-ben, FOLLOWED BY a reconciled for
    //    sess-ben (ordering by the append-only event id).
    const benFenced = allEvents.filter(
      (e) =>
        e.type === "write.fenced" &&
        (e.payload as { session_id?: string }).session_id === SESSION_IDS.ben,
    );
    assert.equal(benFenced.length, 1, "exactly one write.fenced for sess-ben across the run");

    assert.ok(
      benFenced[0].id < benReconciled[0].id,
      "the write.fenced precedes the reconciled for sess-ben",
    );

    // and the whole run has exactly one write.fenced overall (honest "exactly one
    // write fenced" — the corrected write was allowed, never re-fenced).
    const allFenced = allEvents.filter((e) => e.type === "write.fenced");
    assert.equal(allFenced.length, 1, "exactly one write.fenced in the entire run");
  } finally {
    ac.abort(); // idempotent; tears down the SSE reader if an assertion threw early
    await streamDone.catch(() => {});
    await bus.close();
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
});
