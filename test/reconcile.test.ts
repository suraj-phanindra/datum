import { test } from "node:test";
import assert from "node:assert/strict";

import { openDb, close as closeDb } from "../server/db.ts";
import { Store } from "../server/store.ts";
import { applyEdit } from "../server/registry.ts";
import { Reconciler } from "../server/reconcile.ts";
import {
  seedScenario,
  ASHA_MIGRATION_AFTER,
  ASHA_WHY,
} from "../server/seed.ts";

test("reconcile: per-session + workspace reconciled on a clean write", () => {
  const db = openDb(":memory:");
  const store = new Store(db);
  seedScenario(store);

  // asha's delta fires: db.users email -> contact_email at epoch 8.
  const { delta } = applyEdit(store, {
    session_id: "sess-asha",
    human: "asha",
    tool_name: "Write",
    path: "migrations/0042_rename.sql",
    after: ASHA_MIGRATION_AFTER,
    why: ASHA_WHY,
  });
  assert.ok(delta, "asha's migration produced a delta");
  assert.equal(delta!.epoch, 8);

  const reconciler = new Reconciler(store);
  reconciler.onDelta(delta!);

  // ben + chen both claim user.email -> both fenced against db.users.
  assert.equal(reconciler.isFenced("sess-ben", "db.users"), true);
  assert.equal(reconciler.isFenced("sess-chen", "db.users"), true);

  // ben lands a clean write (no stale .email) -> per-session reconciled, no
  // workspace yet (chen still outstanding).
  const benEvents = reconciler.onEdit({
    sessionId: "sess-ben",
    human: "ben",
    path: "routes/users.ts",
    content: "const u = await db.query('select contact_email from users');",
  });
  const benPerSession = benEvents.filter(
    (e) => e.type === "reconciled" && (e.payload as { workspace?: boolean }).workspace !== true,
  );
  assert.equal(benPerSession.length, 1, "ben emits one per-session reconciled");
  assert.equal((benPerSession[0].payload as { session_id: string }).session_id, "sess-ben");
  assert.equal((benPerSession[0].payload as { contract_id: string }).contract_id, "db.users");
  assert.equal((benPerSession[0].payload as { epoch: number }).epoch, 8);
  assert.equal((benPerSession[0].payload as { path: string }).path, "routes/users.ts");
  const benWorkspace = benEvents.filter(
    (e) => e.type === "reconciled" && (e.payload as { workspace?: boolean }).workspace === true,
  );
  assert.equal(benWorkspace.length, 0, "no workspace reconciled until all consumers done");

  // a still-stale write from chen must NOT reconcile.
  const stillStale = reconciler.onEdit({
    sessionId: "sess-chen",
    human: "chen",
    path: "UserCard.tsx",
    content: "const e = user.email;",
  });
  assert.equal(stillStale.length, 0, "stale content does not reconcile");
  assert.equal(reconciler.isFenced("sess-chen", "db.users"), true);

  // chen lands a clean write -> per-session reconciled + workspace reconciled.
  const chenEvents = reconciler.onEdit({
    sessionId: "sess-chen",
    human: "chen",
    path: "UserCard.tsx",
    content: "const e = user.contact_email;",
  });
  const chenPerSession = chenEvents.filter(
    (e) => e.type === "reconciled" && (e.payload as { workspace?: boolean }).workspace !== true,
  );
  assert.equal(chenPerSession.length, 1, "chen emits one per-session reconciled");

  const workspace = chenEvents.filter(
    (e) => e.type === "reconciled" && (e.payload as { workspace?: boolean }).workspace === true,
  );
  assert.equal(workspace.length, 1, "workspace reconciled when all consumers done");
  const wpPayload = workspace[0].payload as { workspace: boolean; epoch: number; sessions: string[] };
  assert.equal(wpPayload.workspace, true);
  assert.equal(wpPayload.epoch, 8);
  assert.deepEqual([...wpPayload.sessions].sort(), ["sess-ben", "sess-chen"]);

  closeDb(db);
});

test("reconcile: correlation key is session_id + contract_id, not path", () => {
  const db = openDb(":memory:");
  const store = new Store(db);
  seedScenario(store);

  const { delta } = applyEdit(store, {
    human: "asha",
    path: "migrations/0042_rename.sql",
    after: ASHA_MIGRATION_AFTER,
    why: ASHA_WHY,
  });
  const reconciler = new Reconciler(store);
  reconciler.onDelta(delta!);

  // ben reconciles on a DIFFERENT path than he was "fenced" on — correlation is
  // by contract, so a clean write on any path clears his db.users fence.
  const events = reconciler.onEdit({
    sessionId: "sess-ben",
    human: "ben",
    path: "routes/something-else.ts",
    content: "uses contact_email only",
  });
  const perSession = events.filter(
    (e) => e.type === "reconciled" && (e.payload as { workspace?: boolean }).workspace !== true,
  );
  assert.equal(perSession.length, 1);
  assert.equal(reconciler.isFenced("sess-ben", "db.users"), false);

  closeDb(db);
});
