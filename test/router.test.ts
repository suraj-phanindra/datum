import { test } from "node:test";
import assert from "node:assert/strict";

import { routeBus, type BusRequest } from "../server/router.ts";
import { Store } from "../server/store.ts";
import { Reconciler } from "../server/reconcile.ts";
import { openDb } from "../server/db.ts";
import { seedScenario, ASHA_MIGRATION_AFTER, ASHA_WHY } from "../server/seed.ts";

// Build a fresh seeded store (epoch 7, db.users v7) on an in-memory backend,
// plus a Reconciler. routeBus is transport-agnostic + synchronous, so we drive
// it directly with no http server.
function freshSeeded(): { store: Store; reconciler: Reconciler } {
  const db = openDb(":memory:");
  const store = new Store(db);
  seedScenario(store);
  return { store, reconciler: new Reconciler(store) };
}

function req(method: string, path: string, opts: { query?: string; body?: unknown } = {}): BusRequest {
  return {
    method,
    path,
    query: new URLSearchParams(opts.query ?? ""),
    body: opts.body,
  };
}

test("router: GET /version returns the seeded epoch (7)", () => {
  const { store, reconciler } = freshSeeded();
  const res = routeBus(store, reconciler, req("GET", "/version"));
  assert.equal(res.status, 200);
  assert.equal((res.body as any).registry_version, 7);
});

test("router: GET /registry returns the version + the seeded contracts", () => {
  const { store, reconciler } = freshSeeded();
  const res = routeBus(store, reconciler, req("GET", "/registry"));
  assert.equal(res.status, 200);
  const body = res.body as any;
  assert.equal(body.registry_version, 7);
  const ids = body.contracts.map((c: any) => c.id).sort();
  assert.ok(ids.includes("db.users"));
  const dbUsers = body.contracts.find((c: any) => c.id === "db.users");
  assert.equal(dbUsers.current_version, 7);
});

test("router: POST /events with a contract-surface edit bumps the version and returns a delta + delta.detected broadcast", () => {
  const { store, reconciler } = freshSeeded();
  const res = routeBus(
    store,
    reconciler,
    req("POST", "/events", {
      body: {
        type: "edit.streamed",
        session_id: "sess-asha",
        human: "asha",
        tool_name: "Write",
        path: "migrations/0042_rename.sql",
        after: ASHA_MIGRATION_AFTER,
        why: ASHA_WHY,
      },
    }),
  );

  assert.equal(res.status, 200);
  const body = res.body as any;
  assert.equal(body.ok, true);
  // contract-surface edit bumped the registry to the next version.
  assert.equal(body.registry_version, 8);
  assert.equal(store.getVersion(), 8);
  assert.equal(res.versionBumped, true);

  // the returned delta describes the rename.
  assert.ok(body.delta, "POST /events returned a delta");
  assert.equal(body.delta.contract_id, "db.users");
  assert.equal(body.delta.from_version, 7);
  assert.equal(body.delta.to_version, 8);
  assert.equal(body.delta.epoch, 8);
  assert.equal(body.delta.mechanical_change.kind, "rename_column");
  assert.equal(body.delta.mechanical_change.from, "email");
  assert.equal(body.delta.mechanical_change.to, "contact_email");

  // the broadcast list carries the raw edit.streamed AND the delta.detected.
  const types = (res.broadcast ?? []).map((b) => b.type);
  assert.ok(types.includes("edit.streamed"), "raw edit.streamed broadcast");
  assert.ok(types.includes("delta.detected"), "delta.detected broadcast");
  const detected = (res.broadcast ?? []).find((b) => b.type === "delta.detected");
  assert.equal((detected!.payload as any).contract_id, "db.users");
  assert.equal((detected!.payload as any).to_version, 8);
  // every broadcast carries the appended-event identity (watchers de-dupe by id).
  for (const b of res.broadcast ?? []) assert.equal(typeof b.id, "number");
});

test("router: POST /events with an off-watchlist edit does not bump and returns no delta", () => {
  const { store, reconciler } = freshSeeded();
  const res = routeBus(
    store,
    reconciler,
    req("POST", "/events", {
      body: {
        type: "edit.streamed",
        session_id: "sess-asha",
        human: "asha",
        path: "README.md",
        after: "just docs",
      },
    }),
  );
  assert.equal(res.status, 200);
  const body = res.body as any;
  assert.equal(body.registry_version, 7);
  assert.equal(store.getVersion(), 7);
  assert.equal(body.delta, undefined);
  assert.ok(!res.versionBumped);
});

test("router: POST /sessions registers a session, returns the snapshot, and broadcasts join + claim", () => {
  const { store, reconciler } = freshSeeded();
  const res = routeBus(
    store,
    reconciler,
    req("POST", "/sessions", {
      body: {
        session_id: "s-new",
        human: "dana",
        branch: "dana/x",
        workspace_id: "acme/workspaces",
        claim_files: ["routes/users.ts"],
        claim_symbols: [".email"],
      },
    }),
  );
  assert.equal(res.status, 200);
  const body = res.body as any;
  assert.equal(body.registry_version, 7);
  assert.equal(body.snapshot.registry_version, 7);
  assert.ok(Array.isArray(body.snapshot.contracts));
  assert.ok(Array.isArray(body.advisories));

  const types = (res.broadcast ?? []).map((b) => b.type);
  assert.deepEqual(types, ["session.joined", "claim.published"]);

  // it actually landed in the store.
  const sess = store.getSession("s-new");
  assert.ok(sess);
  assert.equal(sess!.human, "dana");
  assert.deepEqual(sess!.claim_files, ["routes/users.ts"]);
});

test("router: PATCH /sessions/:id advances last_synced_version and re-broadcasts a claim on a claim change", () => {
  const { store, reconciler } = freshSeeded();
  routeBus(
    store,
    reconciler,
    req("POST", "/sessions", {
      body: { session_id: "s1", human: "ben", branch: "ben/api", claim_files: ["routes/users.ts"] },
    }),
  );

  // patch with a claim change -> ok + a claim.published broadcast.
  const res = routeBus(
    store,
    reconciler,
    req("PATCH", "/sessions/s1", {
      body: { last_synced_version: 8, claim_files: ["routes/users.ts", "routes/invites.ts"] },
    }),
  );
  assert.equal(res.status, 200);
  assert.equal((res.body as any).ok, true);
  const types = (res.broadcast ?? []).map((b) => b.type);
  assert.deepEqual(types, ["claim.published"]);
  assert.equal(store.getSession("s1")!.last_synced_version, 8);

  // patch a non-existent session fails open (ok: false), no broadcast.
  const miss = routeBus(store, reconciler, req("PATCH", "/sessions/nope", { body: { status: "idle" } }));
  assert.equal(miss.status, 200);
  assert.equal((miss.body as any).ok, false);
  assert.deepEqual(miss.broadcast ?? [], []);
});

test("router: POST /decide is epoch-neutral (ledger id increments, version unchanged)", () => {
  const { store, reconciler } = freshSeeded();
  const before = store.getVersion();
  const r1 = routeBus(
    store,
    reconciler,
    req("POST", "/decide", { body: { author: "ben", description: "adopt zod" } }),
  );
  assert.equal(r1.status, 200);
  const b1 = r1.body as any;
  assert.equal(b1.registry_version, before, "decide does not bump the epoch");
  assert.equal(store.getVersion(), before);
  // seed loads #110/#111 so the next ledger id is 112.
  assert.equal(b1.ledger_id, 112);
  // no version bump, no stream broadcast.
  assert.ok(!r1.versionBumped);
  assert.deepEqual(r1.broadcast ?? [], []);

  const r2 = routeBus(
    store,
    reconciler,
    req("POST", "/decide", { body: { author: "chen", description: "another" } }),
  );
  assert.equal((r2.body as any).ledger_id, 113);
  assert.equal(store.getVersion(), before);
});

test("router: unknown route 404s", () => {
  const { store, reconciler } = freshSeeded();
  const res = routeBus(store, reconciler, req("GET", "/nope"));
  assert.equal(res.status, 404);
  assert.equal((res.body as any).ok, false);
});
