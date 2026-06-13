import { test } from "node:test";
import assert from "node:assert/strict";

import { startBus } from "../server/index.ts";
import { Store } from "../server/store.ts";
import { seedScenario, ASHA_MIGRATION_AFTER, ASHA_WHY } from "../server/seed.ts";
import { openDb } from "../server/db.ts";

// Helper: small JSON fetch wrapper.
async function jget(url: string): Promise<{ status: number; body: any }> {
  const res = await fetch(url);
  return { status: res.status, body: await res.json() };
}
async function jpost(
  url: string,
  body: unknown,
  method = "POST",
): Promise<{ status: number; body: any }> {
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
}

test("bus: healthz ok on a fresh ephemeral in-memory bus", async () => {
  const bus = await startBus({ port: 0, dbPath: ":memory:" });
  try {
    const health = await jget(`${bus.url}/healthz`);
    assert.equal(health.status, 200);
    assert.equal(health.body.ok, true);
    const v0 = await jget(`${bus.url}/version`);
    assert.equal(v0.body.registry_version, 0);
  } finally {
    await bus.close();
  }
});

test("bus: seeded scenario — asha migration bumps to v8, delta.detected on stream, README no-bump, decide neutral", async () => {
  // We need a SEEDED bus (epoch 7, db.users v7). startBus opens its own db, so
  // we seed a file db first, then point the bus at it.
  const tmp = `:memory:`;
  // Seed requires sharing the connection; use a temp file db so both the seeder
  // and the bus open the same path.
  const path = await import("node:path");
  const os = await import("node:os");
  const fs = await import("node:fs");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "datum-bus-"));
  const dbPath = path.join(dir, "datum.db");

  // 1) seed the file db to the pre-delta state.
  const seedDb = openDb(dbPath);
  const seedStore = new Store(seedDb);
  seedScenario(seedStore);
  seedDb.close();

  // 2) start the bus on the seeded db.
  const bus = await startBus({ port: 0, dbPath });

  try {
    // seed loaded: epoch 7.
    const v = await jget(`${bus.url}/version`);
    assert.equal(v.body.registry_version, 7);

    // registry snapshot shows db.users v7 + the others.
    const reg = await jget(`${bus.url}/registry`);
    assert.equal(reg.body.registry_version, 7);
    const ids = reg.body.contracts.map((c: any) => c.id).sort();
    assert.deepEqual(ids, [
      "api.GET /users/:id",
      "api.POST /invites",
      "db.users",
      "deps.db-driver",
    ]);

    // ---- subscribe to /stream to capture delta.detected ----
    const streamEvents: any[] = [];
    const ac = new AbortController();
    const streamDone = (async () => {
      const res = await fetch(`${bus.url}/stream`, { signal: ac.signal });
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
                streamEvents.push(JSON.parse(dataLine.slice(6)));
              } catch {
                /* ignore non-json frames */
              }
            }
          }
        }
      } catch {
        /* aborted */
      }
    })();

    // ---- POST /events for asha's migration edit -> { registry_version: 8, delta } ----
    const editRes = await jpost(`${bus.url}/events`, {
      type: "edit.streamed",
      session_id: "sess-asha",
      human: "asha",
      tool_name: "Write",
      path: "migrations/0042_rename.sql",
      after: ASHA_MIGRATION_AFTER,
      why: ASHA_WHY,
    });
    assert.equal(editRes.status, 200);
    assert.equal(editRes.body.ok, true);
    assert.equal(editRes.body.registry_version, 8);
    assert.ok(editRes.body.delta, "POST /events returned a delta");
    assert.equal(editRes.body.delta.contract_id, "db.users");
    assert.equal(editRes.body.delta.from_version, 7);
    assert.equal(editRes.body.delta.to_version, 8);
    assert.equal(editRes.body.delta.epoch, 8);
    assert.equal(editRes.body.delta.mechanical_change.kind, "rename_column");
    assert.equal(editRes.body.delta.mechanical_change.from, "email");
    assert.equal(editRes.body.delta.mechanical_change.to, "contact_email");

    // GET /version -> 8.
    const v8 = await jget(`${bus.url}/version`);
    assert.equal(v8.body.registry_version, 8);

    // registry now shows db.users current_version 8.
    const reg8 = await jget(`${bus.url}/registry`);
    assert.equal(reg8.body.registry_version, 8);
    const dbUsers = reg8.body.contracts.find((c: any) => c.id === "db.users");
    assert.equal(dbUsers.current_version, 8);

    // GET /deltas?since=7 returns the asha delta.
    const deltas = await jget(`${bus.url}/deltas?since=7`);
    assert.equal(deltas.body.deltas.length, 1);
    assert.equal(deltas.body.deltas[0].contract_id, "db.users");

    // ---- POST /events for a README edit -> version still 8, no delta ----
    const readme = await jpost(`${bus.url}/events`, {
      type: "edit.streamed",
      session_id: "sess-asha",
      human: "asha",
      tool_name: "Write",
      path: "README.md",
      after: "# Workspace invites\n",
    });
    assert.equal(readme.body.registry_version, 8);
    assert.equal(readme.body.delta, undefined);

    // also a *.test.ts edit -> still 8.
    const testEdit = await jpost(`${bus.url}/events`, {
      type: "edit.streamed",
      session_id: "sess-asha",
      human: "asha",
      path: "server/foo.test.ts",
      after: "test('x', () => {})",
    });
    assert.equal(testEdit.body.registry_version, 8);

    // ---- POST /decide is epoch-NEUTRAL: ledger id returned, version unchanged ----
    const decide = await jpost(`${bus.url}/decide`, {
      author: "chen",
      description: "use SSE for the tower stream",
      contract: "decision",
    });
    assert.equal(decide.status, 200);
    assert.ok(typeof decide.body.ledger_id === "number");
    assert.equal(decide.body.registry_version, 8, "decide does not bump the epoch");

    // give the stream a beat to flush, then assert delta.detected was seen.
    await new Promise((r) => setTimeout(r, 50));
    ac.abort();
    await streamDone.catch(() => {});
    const deltaDetected = streamEvents.filter((e) => e.type === "delta.detected");
    assert.ok(deltaDetected.length >= 1, "a delta.detected event was streamed");
    assert.equal(deltaDetected[0].payload.contract_id, "db.users");
    assert.equal(deltaDetected[0].payload.to_version, 8);
  } finally {
    await bus.close();
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
});

test("bus: sessions join + patch advances last_synced_version, decide returns incrementing ledger ids", async () => {
  const bus = await startBus({ port: 0, dbPath: ":memory:" });
  try {
    // join a session.
    const join = await jpost(`${bus.url}/sessions`, {
      session_id: "s1",
      human: "ben",
      branch: "ben/api",
      claim_files: ["routes/users.ts"],
      claim_symbols: ["user.email"],
    });
    assert.equal(join.status, 200);
    assert.ok(join.body.snapshot);
    assert.deepEqual(join.body.advisories, []);

    // PATCH advances last_synced_version + returns { ok, registry_version }.
    const patch = await jpost(
      `${bus.url}/sessions/s1`,
      { last_synced_version: 8 },
      "PATCH",
    );
    assert.equal(patch.body.ok, true);
    assert.equal(typeof patch.body.registry_version, "number");

    // two decides -> distinct ledger ids, epoch unchanged.
    const d1 = await jpost(`${bus.url}/decide`, { author: "ben", description: "one" });
    const d2 = await jpost(`${bus.url}/decide`, { author: "ben", description: "two" });
    assert.notEqual(d1.body.ledger_id, d2.body.ledger_id);
  } finally {
    await bus.close();
  }
});
