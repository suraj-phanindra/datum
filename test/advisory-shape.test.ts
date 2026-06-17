// test/advisory-shape.test.ts — the arbiter acceptance test (offline + deterministic).
//
// Acceptance check: the arbiter produces two different advisories for two
// different recipients from one delta, each written for that recipient's file
// and task. Uses a FAKE modelClient returning canned, distinct prose keyed by
// recipient, so the test never touches the network and is fully deterministic.
//
// Run: node --test test/advisory-shape.test.ts

import { test } from "node:test";
import assert from "node:assert/strict";

import { openDb, close as closeDb } from "../server/db.ts";
import { Store } from "../server/store.ts";
import { applyEdit } from "../server/registry.ts";
import { seedScenario, ASHA_MIGRATION_AFTER, ASHA_WHY } from "../server/seed.ts";

import { runArbiter } from "../server/arbiter/index.ts";
import { intersect } from "../server/arbiter/intersect.ts";
import type { ModelClient } from "../server/arbiter/advise.ts";
import type { PromptPayload } from "../server/arbiter/prompt.ts";
import type { Delta } from "../server/store.ts";

// A fake model client: returns canned, DISTINCT prose per recipient, parsed out
// of the recipient-slice text in the prompt. Offline + deterministic.
const fakeModelClient: ModelClient = async (prompt: PromptPayload): Promise<string> => {
  const userText = prompt.messages.flatMap((m) => m.content.map((b) => b.text)).join("\n");
  if (/RECIPIENT:\s*ben\b/.test(userText)) {
    return [
      "users.email is now contact_email (migration 0042, asha). Your open diff in routes/users.ts selects .email in two queries; update both before your next write.",
      "- Update both .email queries in routes/users.ts to contact_email",
      "- Re-sync to v8 before your next write",
    ].join("\n");
  }
  if (/RECIPIENT:\s*chen\b/.test(userText)) {
    return [
      "UserDTO.email renamed to contact_email by asha (db.users). UserCard.tsx line 18 reads user.email and will break at runtime; regenerate types from the API client.",
      "- Regenerate UserDTO types from the API client",
      "- Replace user.email at UserCard.tsx line 18 with the new field",
    ].join("\n");
  }
  return "Generic advisory.\n- Reconcile and re-sync.";
};

/** Seed + fire asha's hero delta; return the store + the delta. */
function setupHeroDelta(): { store: Store; delta: Delta; db: ReturnType<typeof openDb> } {
  const db = openDb(":memory:");
  const store = new Store(db);
  seedScenario(store);

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
  assert.equal(delta!.contract_id, "db.users");
  return { store, delta: delta!, db };
}

test("arbiter: two distinct advisories for the hero delta (ben + chen)", async () => {
  const { store, delta, db } = setupHeroDelta();

  const advisories = await runArbiter(store, delta, { modelClient: fakeModelClient });

  // exactly 2 advisories from the one db.users delta.
  assert.equal(advisories.length, 2, "exactly two advisories");

  const ben = advisories.find((a) => a.recipient === "ben");
  const chen = advisories.find((a) => a.recipient === "chen");
  assert.ok(ben, "ben got an advisory");
  assert.ok(chen, "chen got an advisory");

  // bodies differ per recipient.
  assert.notEqual(ben!.body, chen!.body, "ben.body !== chen.body");

  // each .file is the recipient's own file.
  assert.equal(ben!.file, "routes/users.ts");
  assert.equal(chen!.file, "UserCard.tsx");

  // severities: ben fenced, chen advised.
  assert.equal(ben!.severity, "fence");
  assert.equal(chen!.severity, "advisory");

  // each delta_ref names db.users + email->contact_email + asha.
  for (const a of [ben!, chen!]) {
    assert.equal(a.delta_ref.contract_id, "db.users");
    assert.equal(a.delta_ref.from_version, 7);
    assert.equal(a.delta_ref.to_version, 8);
    assert.equal(a.delta_ref.migration, "0042");
    assert.equal(a.delta_ref.author, "asha");
  }

  // each has >= 1 concrete action.
  assert.ok(ben!.actions.length >= 1, "ben has >=1 action");
  assert.ok(chen!.actions.length >= 1, "chen has >=1 action");

  // each body is tailored to that recipient's file.
  assert.match(ben!.body, /routes\/users\.ts/);
  assert.match(chen!.body, /UserCard\.tsx/);

  closeDb(db);
});

test("arbiter: one advisory.delivered event appended per recipient", async () => {
  const { store, delta, db } = setupHeroDelta();

  const before = store.getEventsSince(0).filter((e) => e.type === "advisory.delivered").length;
  assert.equal(before, 0);

  await runArbiter(store, delta, { modelClient: fakeModelClient });

  const delivered = store.getEventsSince(0).filter((e) => e.type === "advisory.delivered");
  assert.equal(delivered.length, 2, "two advisory.delivered events");

  const recipients = delivered.map((e) => (e.payload as { recipient: string }).recipient).sort();
  assert.deepEqual(recipients, ["ben", "chen"]);

  // payload shape (schema §3): { session_id, human, recipient, file, advisory }.
  for (const e of delivered) {
    const p = e.payload as Record<string, unknown>;
    assert.ok(typeof p.session_id === "string");
    assert.ok(typeof p.human === "string");
    assert.ok(typeof p.recipient === "string");
    assert.ok(typeof p.file === "string");
    assert.ok(p.advisory && typeof p.advisory === "object");
  }

  closeDb(db);
});

test("arbiter: intersect excludes asha (the author)", () => {
  const { store, delta, db } = setupHeroDelta();

  const recipients = intersect(delta, store.listSessions());
  const humans = recipients.map((s) => s.human).sort();

  assert.deepEqual(humans, ["ben", "chen"], "only ben + chen intersect");
  assert.ok(!humans.includes("asha"), "asha (author) is excluded");

  closeDb(db);
});
