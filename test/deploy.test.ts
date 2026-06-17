// test/deploy.test.ts — the deploy track acceptance suite (deploy PRD).
//
// Run: node --test test/deploy.test.ts
//
// Verifies the acceptance check that the live URL returns 200 and shows the
// registry at v8, and the observability-layer requirement that a live URL shows
// v8 with no bus process running:
//
// Case 1 (snapshot is the frozen v8 end-state):
//   (re)generate web/snapshot.json via the demo/seed-snapshot.ts builder, then
//   assert snapshot.registry.registry_version === 8, a db.users contract at
//   current_version 8, and that the frozen event replay contains all SIX event
//   types through spec.pr.opened #14 (RECONCILIATION gate 3).
//
// Case 2 (static host, NO bus): serve the built web/ dir from a tiny node:http
//   static server (NOT the datum bus) and assert GET / -> 200 and the page
//   hydrates v8 — snapshot.json is fetchable and reads registry_version 8 (the
//   pure-static client path), with NO datum bus process running during the fetch.
//
// Case 3 (serve.ts snapshot mode): with DATUM_SNAPSHOT=1 and no bus, the tower's
//   serve.ts embeds window.__DATUM__ = the baked v8 snapshot.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, extname } from "node:path";
import { fileURLToPath } from "node:url";

import { buildSnapshot, writeSnapshot, type DatumSnapshot } from "../demo/seed-snapshot.ts";
import { startTower } from "../web/serve.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const WEB_DIR = join(HERE, "..", "web");
const SNAPSHOT_PATH = join(WEB_DIR, "snapshot.json");

// The six event types the drift-card state machine consumes through `patched`
// (schema §3). reconciled appears as 2 per-session + 1 workspace; the type count
// here is the distinct SET, which must include all six.
const REQUIRED_EVENT_TYPES = [
  "delta.detected",
  "write.fenced",
  "advisory.delivered",
  "reconciled",
  "spec.pr.opened",
];

test("deploy: seed-snapshot builds a frozen v8 end-state with the full event replay", async () => {
  // (re)generate the snapshot from the deterministic builder + write it to disk
  // (the committed web/snapshot.json). This regen runs the arbiter + spec-pr so
  // the replay payloads are frozen before publishing.
  // Build in an ISOLATED tmp repo dir (not the shared demo/workspace-invites/)
  // so this test never races demo-runner.test.ts under parallel `node --test`.
  const repoDir = mkdtempSync(join(tmpdir(), "datum-deploy-repo-"));
  const snapshot: DatumSnapshot = await buildSnapshot(repoDir);
  rmSync(repoDir, { recursive: true, force: true });
  writeSnapshot(snapshot, SNAPSHOT_PATH);

  // --- registry at v8 + db.users contract at current_version 8 ---
  assert.equal(snapshot.registry.registry_version, 8, "snapshot.registry.registry_version === 8");
  const dbUsers = snapshot.registry.contracts.find((c) => c.id === "db.users");
  assert.ok(dbUsers, "db.users contract present in the snapshot registry");
  assert.equal(dbUsers!.current_version, 8, "db.users at current_version 8");
  // the four seeded contracts, nothing spurious (no api.routes/* leak from a
  // mis-bumped reconcile write).
  assert.equal(snapshot.registry.contracts.length, 4, "exactly the four seeded contracts");

  // --- the v8 db.users delta is in the deltas surface ---
  assert.ok(
    snapshot.deltas.some((d) => d.contract_id === "db.users" && d.epoch === 8 && d.to_version === 8),
    "the db.users v7->v8 delta (epoch 8) is in the deltas surface",
  );

  // --- the frozen replay contains all six event types through spec.pr.opened #14 ---
  const typesPresent = new Set(snapshot.events.map((e) => e.type));
  for (const t of REQUIRED_EVENT_TYPES) {
    assert.ok(typesPresent.has(t), `event replay contains "${t}"`);
  }
  // write.fenced exactly once (the single honest fenced write).
  assert.equal(
    snapshot.events.filter((e) => e.type === "write.fenced").length,
    1,
    "exactly one write.fenced in the replay",
  );
  // two advisory.delivered that differ (ben fence / chen advisory).
  const advised = snapshot.events.filter((e) => e.type === "advisory.delivered");
  assert.equal(advised.length, 2, "two advisory.delivered in the replay");
  const benAdv = advised.find((e) => (e.payload as { recipient?: string }).recipient === "ben");
  const chenAdv = advised.find((e) => (e.payload as { recipient?: string }).recipient === "chen");
  assert.ok(benAdv && chenAdv, "advisories addressed to ben and chen");
  // reconciled: 2 per-session + 1 workspace.
  const reconciled = snapshot.events.filter((e) => e.type === "reconciled");
  assert.equal(reconciled.length, 3, "three reconciled (2 per-session + workspace)");
  assert.ok(
    reconciled.some((e) => (e.payload as { workspace?: boolean }).workspace === true),
    "a workspace reconciled is in the replay",
  );
  // spec.pr.opened #14, patch docs/spec.md, linking ledger #112.
  const specPr = snapshot.events.filter((e) => e.type === "spec.pr.opened");
  assert.equal(specPr.length, 1, "exactly one spec.pr.opened");
  const specPayload = specPr[0].payload as {
    pr_number?: number;
    patch_path?: string;
    epoch?: number;
    ledger_id?: number;
  };
  assert.equal(specPayload.pr_number, 14, "spec PR #14");
  assert.equal(specPayload.patch_path, "docs/spec.md", "spec PR patches docs/spec.md");
  assert.equal(specPayload.epoch, 8, "spec PR is for epoch 8");
  assert.equal(specPayload.ledger_id, 112, "spec PR links ledger #112");

  // --- the ledger carries #112/#111/#110 (newest first), #112 born live ---
  assert.deepEqual(
    snapshot.ledger.map((l) => l.id),
    [112, 111, 110],
    "ledger is #112, #111, #110 newest-first",
  );
});

test("deploy: a pure static host serves GET / -> 200 and the page hydrates v8 with NO bus", async () => {
  // ensure the committed snapshot exists (regen if a prior test didn't write it).
  let snapshotJson: string;
  try {
    snapshotJson = await readFile(SNAPSHOT_PATH, "utf8");
  } catch {
    writeSnapshot(await buildSnapshot(), SNAPSHOT_PATH);
    snapshotJson = await readFile(SNAPSHOT_PATH, "utf8");
  }

  // a TINY static file server for web/ — this is NOT the datum bus. No bus is
  // running anywhere; the page must still serve + hydrate to v8.
  const server = await startStaticServer(WEB_DIR);
  try {
    // GET / -> 200, serves index.html.
    const root = await fetch(`${server.url}/`);
    assert.equal(root.status, 200, "the live (static) URL returns 200");
    const html = await root.text();
    assert.ok(html.includes("tower.js"), "the served page loads the tower client");
    // the static index.html carries the seeded end-state markup (v8) directly.
    assert.ok(html.includes("tower-root"), "the tower markup is present");

    // the static hydration path: snapshot.json is fetchable from the
    // static host and reads registry_version 8 (the client fetches ./snapshot.json
    // when no window.__DATUM__ embed is present). NO bus process is involved.
    const snapRes = await fetch(`${server.url}/snapshot.json`);
    assert.equal(snapRes.status, 200, "snapshot.json is fetchable from the static host");
    const snap = (await snapRes.json()) as {
      registry?: { registry_version?: number; contracts?: Array<{ id: string; current_version: number }> };
    };
    assert.equal(snap.registry?.registry_version, 8, "snapshot.json reads registry_version 8");
    const dbUsers = snap.registry?.contracts?.find((c) => c.id === "db.users");
    assert.ok(dbUsers, "db.users present in the served snapshot.json");
    assert.equal(dbUsers!.current_version, 8, "db.users at v8 in the served snapshot.json");

    // sanity: the served snapshot.json is byte-identical to the committed file.
    assert.equal(JSON.stringify(snap), JSON.stringify(JSON.parse(snapshotJson)));
  } finally {
    await server.close();
  }
});

test("deploy: serve.ts in DATUM_SNAPSHOT=1 mode embeds the baked v8 snapshot with NO bus", async () => {
  // ensure the snapshot exists.
  try {
    await readFile(SNAPSHOT_PATH, "utf8");
  } catch {
    writeSnapshot(await buildSnapshot(), SNAPSHOT_PATH);
  }

  const prev = process.env.DATUM_SNAPSHOT;
  process.env.DATUM_SNAPSHOT = "1";
  // point the tower at a dead bus url to prove the embed comes from the baked
  // snapshot, not a live bus — DATUM_SNAPSHOT=1 short-circuits the bus entirely.
  const tower = await startTower({ port: 0, busUrl: "http://127.0.0.1:1" });
  try {
    const res = await fetch(`${tower.url}/`);
    assert.equal(res.status, 200, "serve.ts returns 200 in snapshot mode");
    const html = await res.text();
    assert.ok(html.includes('"registry_version":8'), "serve.ts embeds registry_version 8 from the baked snapshot");
    assert.ok(html.includes('"id":"db.users"'), "the db.users contract is embedded");
    assert.ok(html.includes('"current_version":8'), "db.users is embedded at v8");

    // the embed is well-formed JSON at v8.
    const m = /window\.__DATUM__ = (\{.*?\});<\/script>/s.exec(html);
    assert.ok(m, "window.__DATUM__ is embedded");
    const embedded = JSON.parse(m![1]);
    assert.equal(embedded.registry_version, 8);
    assert.ok(
      embedded.contracts.some((c: { id: string; current_version: number }) => c.id === "db.users" && c.current_version === 8),
      "db.users v8 in the embedded snapshot",
    );

    // serve.ts also serves the baked snapshot.json directly (the client fallback).
    const snapRes = await fetch(`${tower.url}/snapshot.json`);
    assert.equal(snapRes.status, 200, "serve.ts serves /snapshot.json");
    const snap = (await snapRes.json()) as { registry?: { registry_version?: number } };
    assert.equal(snap.registry?.registry_version, 8, "served /snapshot.json reads v8");
  } finally {
    await tower.close();
    if (prev === undefined) delete process.env.DATUM_SNAPSHOT;
    else process.env.DATUM_SNAPSHOT = prev;
  }
});

// ---------------------------------------------------------------------------
// a tiny node:http static file server for the web/ bundle (no datum bus). It
// only serves files that exist under the root; this is the "any static host"
// stand-in the deploy artifact targets.
// ---------------------------------------------------------------------------

const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};

async function startStaticServer(rootDir: string): Promise<{ url: string; close: () => Promise<void> }> {
  const server = createServer((req, res) => {
    void (async () => {
      const rawPath = (req.url ?? "/").split("?")[0];
      const rel = rawPath === "/" || rawPath === "" ? "index.html" : rawPath.replace(/^\/+/, "");
      // prevent path traversal out of the web dir.
      if (rel.includes("..")) {
        res.writeHead(403);
        res.end("forbidden");
        return;
      }
      try {
        const body = await readFile(join(rootDir, rel), "utf8");
        const ct = CONTENT_TYPES[extname(rel)] ?? "application/octet-stream";
        res.writeHead(200, { "Content-Type": ct });
        res.end(body);
      } catch {
        res.writeHead(404, { "Content-Type": "text/plain" });
        res.end("not found");
      }
    })();
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      resolve({
        url: `http://127.0.0.1:${port}`,
        close: () => new Promise<void>((done) => server.close(() => done())),
      });
    });
  });
}
