// test/tower.test.ts — the web tower (read-only) acceptance suite.
//
// Run: node --test test/tower.test.ts
//
// Case 1 (RUBRIC "the live URL returns 200 and shows the registry at v8"):
//   start a SEEDED bus on an ephemeral port, applyEdit asha's migration so the
//   epoch === 8, start the tower pointing at the bus, GET / -> HTTP 200 and the
//   returned HTML contains the SERVER-SIDE-EMBEDDED snapshot with
//   "registry_version":8 AND a db.users entry with "current_version":8.
//
// Case 2 (the NOT-A-DASHBOARD line): stop the tower and confirm the bus still
//   answers GET /version with 8 — killing the tower changes nothing on the bus.

import { test } from "node:test";
import assert from "node:assert/strict";
import * as path from "node:path";
import * as os from "node:os";
import * as fs from "node:fs";

import { startBus } from "../server/index.ts";
import { Store } from "../server/store.ts";
import { openDb } from "../server/db.ts";
import { applyEdit } from "../server/registry.ts";
import { seedScenario, ASHA_MIGRATION_AFTER, ASHA_WHY } from "../server/seed.ts";
import { startTower } from "../web/serve.ts";

async function jget(url: string): Promise<{ status: number; body: any }> {
  const res = await fetch(url);
  return { status: res.status, body: await res.json() };
}

test("tower: GET / returns 200 and embeds the registry at v8; killing it leaves the bus at v8", async () => {
  // A shared file db so the seed/applyEdit and the bus see the same registry.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "datum-tower-"));
  const dbPath = path.join(dir, "datum.db");

  // 1) seed the pre-delta state (epoch 7, db.users v7) AND applyEdit asha's
  //    migration so the registry advances to epoch 8 (db.users -> v8).
  const seedDb = openDb(dbPath);
  const seedStore = new Store(seedDb);
  seedScenario(seedStore);
  const applied = applyEdit(seedStore, {
    session_id: "sess-asha",
    human: "asha",
    tool_name: "Write",
    path: "migrations/0042_rename.sql",
    after: ASHA_MIGRATION_AFTER,
    why: ASHA_WHY,
  });
  assert.equal(applied.registry_version, 8, "applyEdit bumped the epoch to 8");
  assert.ok(applied.delta, "applyEdit produced a delta");
  assert.equal(applied.delta!.contract_id, "db.users");
  assert.equal(applied.delta!.to_version, 8);
  seedDb.close();

  // 2) start the bus on the seeded+bumped db, then the tower pointing at it.
  const bus = await startBus({ port: 0, dbPath });
  const tower = await startTower({ port: 0, busUrl: bus.url });

  try {
    // sanity: the bus itself is at v8.
    const v = await jget(`${bus.url}/version`);
    assert.equal(v.body.registry_version, 8);

    // ---- GET / : HTTP 200 + server-side-embedded snapshot ----
    const res = await fetch(`${tower.url}/`);
    assert.equal(res.status, 200, "the live URL returns 200");
    const html = await res.text();

    // the real "shows v8" assertion: the embedded snapshot reads v8 ...
    assert.ok(
      html.includes('"registry_version":8'),
      'served HTML embeds "registry_version":8',
    );
    // ... and the db.users contract row reads current_version 8.
    assert.ok(
      html.includes('"id":"db.users"'),
      "served HTML embeds the db.users contract",
    );
    assert.ok(
      html.includes('"current_version":8'),
      'served HTML embeds a contract with "current_version":8',
    );

    // the embedded snapshot is well-formed JSON with db.users at v8.
    const m = /window\.__DATUM__ = (\{.*?\});<\/script>/s.exec(html);
    assert.ok(m, "window.__DATUM__ is embedded as inline JSON");
    const embedded = JSON.parse(m![1]);
    assert.equal(embedded.registry_version, 8);
    const dbUsers = embedded.contracts.find((c: any) => c.id === "db.users");
    assert.ok(dbUsers, "db.users is present in the embedded snapshot");
    assert.equal(dbUsers.current_version, 8, "db.users reads v8 in the embed");
    assert.ok(Array.isArray(embedded.deltas), "deltas array embedded");
    assert.ok(
      embedded.deltas.some((d: any) => d.contract_id === "db.users" && d.epoch === 8),
      "the v8 db.users delta is embedded",
    );

    // the page loads tower.js (the SSE router) and the token stylesheets.
    assert.ok(html.includes('src="/tower.js"'), "tower.js is loaded");
    assert.ok(html.includes('href="/tokens.css"'), "bundled tokens.css linked");
    assert.ok(html.includes('href="/tokens-shim.css"'), "tokens shim linked");

    // ---- NOT-A-DASHBOARD: stop the tower; the bus is unaffected. ----
    await tower.close();
    const afterTowerDown = await jget(`${bus.url}/version`);
    assert.equal(
      afterTowerDown.body.registry_version,
      8,
      "with the tower stopped, the bus still answers GET /version with 8",
    );
  } finally {
    // tower may already be closed; closing twice is a no-op guard.
    try {
      await tower.close();
    } catch {
      /* already closed */
    }
    await bus.close();
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
});

test("tower: serves tower.js, tokens-shim.css, and the bundled design-system tokens", async () => {
  const bus = await startBus({ port: 0, dbPath: ":memory:" });
  const tower = await startTower({ port: 0, busUrl: bus.url });
  try {
    const js = await fetch(`${tower.url}/tower.js`);
    assert.equal(js.status, 200);
    assert.match(js.headers.get("content-type") ?? "", /javascript/);
    const jsText = await js.text();
    assert.ok(jsText.includes("window.__DATUM__"), "tower.js hydrates from the embed");
    assert.ok(jsText.includes("DatumTower"), "tower.js exposes the SSE router hook");

    const shim = await fetch(`${tower.url}/tokens-shim.css`);
    assert.equal(shim.status, 200);
    const shimText = await shim.text();
    // the shim aliases the mockup --color-* names onto shipped tokens.
    assert.ok(shimText.includes("--color-background-danger"));
    assert.ok(shimText.includes("--signal-red-tint"));
    assert.ok(shimText.includes("--color-text-warning"));
    assert.ok(shimText.includes("--signal-amber"));

    const tokens = await fetch(`${tower.url}/tokens.css`);
    assert.equal(tokens.status, 200);
    const tokensText = await tokens.text();
    // the shipped design-system tokens are bundled in.
    assert.ok(tokensText.includes("--amber: #F5A623"), "amber token bundled");
    assert.ok(tokensText.includes("--font-mono"), "mono token bundled");
  } finally {
    await tower.close();
    await bus.close();
  }
});

test("tower: GET / fails OPEN with an empty snapshot when the bus is unreachable", async () => {
  // point the tower at a dead bus url; GET / must still 200 (read-only viewer).
  const tower = await startTower({ port: 0, busUrl: "http://127.0.0.1:1" });
  try {
    const res = await fetch(`${tower.url}/`);
    assert.equal(res.status, 200, "tower serves the page even with the bus down");
    const html = await res.text();
    assert.ok(html.includes("window.__DATUM__"), "an (empty) snapshot is still embedded");
  } finally {
    await tower.close();
  }
});
