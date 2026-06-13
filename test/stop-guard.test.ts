// test/stop-guard.test.ts — the Stop guard acceptance test (stretch, P3).
// Run: node --test test/stop-guard.test.ts
//
// Satisfies RUBRIC "Nice to have": "Stop hook prevents an agent from declaring
// done while unacknowledged deltas intersect its diff."
//
// Assertions:
//   (1) session behind one epoch, claim_symbols incl 'user.email'/'.email', the
//       seeded db.users v7->v8 delta -> guard BLOCKS (exit 2 or {decision:block});
//       reason names db.users + email->contact_email + asha.
//   (2) last_synced === registry_version -> ALLOW, and assert NO /deltas fetch
//       happened (cache-hit fast path).
//   (3) diff already using contact_email (claim_symbols swapped) -> ALLOW.
//   (4) bus down (unreachable url) -> ALLOW (fail-open) + a warning line logged.
//
// We spawn the hook with ASYNC spawn (not spawnSync — spawnSync would block this
// process's event loop and deadlock the in-process bus's fetch round-trip).

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { createServer, type Server } from "node:http";

import { startBus } from "../server/index.ts";
import { Store } from "../server/store.ts";
import { openDb } from "../server/db.ts";
import { seedScenario, ASHA_MIGRATION_AFTER, ASHA_WHY } from "../server/seed.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(HERE, "..");
const GUARD_HOOK = join(PROJECT_ROOT, "hooks", "datum-guard.ts");

type HookResult = { status: number | null; stdout: string; stderr: string };

/**
 * Spawn the guard hook asynchronously, feed it a Stop envelope on stdin, resolve
 * with { status, stdout, stderr }. ASYNC spawn is mandatory: the bus runs on this
 * process's event loop, so spawnSync would deadlock the hook's fetch back to it.
 */
function runHook(input: string, cwd: string, env?: NodeJS.ProcessEnv): Promise<HookResult> {
  return new Promise((resolveRun) => {
    const child = spawn(process.execPath, [GUARD_HOOK], {
      cwd,
      env: env ?? process.env,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d.toString()));
    child.stderr.on("data", (d) => (stderr += d.toString()));
    child.on("close", (code) => resolveRun({ status: code, stdout, stderr }));
    child.on("error", () => resolveRun({ status: 1, stdout, stderr }));
    child.stdin.write(input);
    child.stdin.end();
  });
}

/** Seed a fresh file-backed db to the pre-delta state (epoch 7, db.users v7). */
function seedDbFile(dir: string): string {
  const dbPath = join(dir, "datum.db");
  const seedDb = openDb(dbPath);
  seedScenario(new Store(seedDb));
  seedDb.close();
  return dbPath;
}

/** Apply asha's hero migration to the bus -> epoch 8 (the v7->v8 db.users delta). */
async function landAshaDelta(busUrl: string): Promise<void> {
  const apply = await fetch(`${busUrl}/events`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      type: "edit.streamed",
      session_id: "sess-asha",
      human: "asha",
      tool_name: "Write",
      path: "migrations/0042_rename.sql",
      after: ASHA_MIGRATION_AFTER,
      why: ASHA_WHY,
    }),
  });
  const body = (await apply.json()) as { registry_version: number };
  assert.equal(body.registry_version, 8, "asha's migration bumped the epoch to 8");
}

/** Write .datum/state.json for a session and return the cwd. */
function makeCwd(state: Record<string, unknown>): string {
  const cwd = mkdtempSync(join(tmpdir(), "datum-guard-cwd-"));
  const datumDir = join(cwd, ".datum");
  mkdirSync(datumDir, { recursive: true });
  writeFileSync(join(datumDir, "state.json"), JSON.stringify(state, null, 2));
  return cwd;
}

test("stop-guard (1): behind one epoch, diff references .email + db.users v7->v8 delta -> BLOCK naming contract + change + author", async () => {
  const dir = mkdtempSync(join(tmpdir(), "datum-guard-db-"));
  const dbPath = seedDbFile(dir);
  const bus = await startBus({ port: 0, dbPath });
  let cwd = "";
  try {
    await landAshaDelta(bus.url);

    // ben is behind at v7; his claim still references email (.email).
    cwd = makeCwd({
      session_id: "sess-ben",
      human: "ben",
      branch: "ben/api",
      last_synced_version: 7,
      claim_files: ["routes/users.ts"],
      claim_symbols: ["user.email", ".email"],
      bus_url: bus.url,
    });

    const stop = { session_id: "sess-ben", cwd };
    const res = await runHook(JSON.stringify(stop), cwd);

    // BLOCK: exit 2 AND a {decision:"block"} payload on stdout.
    assert.equal(res.status, 2, `guard blocks the stop (exit 2). stderr: ${res.stderr}`);
    const parsed = JSON.parse(res.stdout);
    assert.equal(parsed.decision, "block");

    // reason names db.users, the email->contact_email change, and asha (the author).
    const reason: string = parsed.reason;
    assert.match(reason, /db\.users/);
    assert.match(reason, /email/);
    assert.match(reason, /contact_email/);
    assert.match(reason, /asha/);
    // the stderr carries the same human reason (Stop-hook convention).
    assert.match(res.stderr, /contact_email/);
  } finally {
    await bus.close();
    try {
      rmSync(dir, { recursive: true, force: true });
      if (cwd) rmSync(cwd, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
});

test("stop-guard (2): last_synced === registry_version -> ALLOW, and NO /deltas fetch (cache-hit fast path)", async () => {
  // A tiny counting bus stub: serves /version (=8) and counts /deltas hits.
  let deltasHits = 0;
  let versionHits = 0;
  const stub: Server = createServer((req, res) => {
    const url = req.url ?? "/";
    if (url.startsWith("/version")) {
      versionHits++;
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ registry_version: 8 }));
      return;
    }
    if (url.startsWith("/deltas")) {
      deltasHits++;
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ deltas: [] }));
      return;
    }
    res.writeHead(404);
    res.end();
  });
  await new Promise<void>((r) => stub.listen(0, "127.0.0.1", r));
  const addr = stub.address();
  const port = typeof addr === "object" && addr ? addr.port : 0;
  const busUrl = `http://127.0.0.1:${port}`;

  let cwd = "";
  try {
    // session is fully synced: last_synced === registry_version (8).
    cwd = makeCwd({
      session_id: "sess-ben",
      human: "ben",
      branch: "ben/api",
      last_synced_version: 8,
      claim_files: ["routes/users.ts"],
      claim_symbols: ["user.email", ".email"], // would block IF deltas were consulted
      bus_url: busUrl,
    });

    const stop = { session_id: "sess-ben", cwd };
    const res = await runHook(JSON.stringify(stop), cwd);

    assert.equal(res.status, 0, `clean synced session allows the stop. stderr: ${res.stderr}`);
    assert.equal(res.stdout.trim(), "", "no block payload printed on the allow path");
    assert.equal(versionHits, 1, "guard checked /version exactly once");
    assert.equal(deltasHits, 0, "cache-hit fast path -> guard did NOT fetch /deltas");
  } finally {
    await new Promise<void>((r) => stub.close(() => r()));
    try {
      if (cwd) rmSync(cwd, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
});

test("stop-guard (3): diff already using contact_email (claim_symbols swapped) -> ALLOW", async () => {
  const dir = mkdtempSync(join(tmpdir(), "datum-guard-ok-"));
  const dbPath = seedDbFile(dir);
  const bus = await startBus({ port: 0, dbPath });
  let cwd = "";
  try {
    await landAshaDelta(bus.url);

    // ben is still behind at v7, but his claim has been swapped to contact_email:
    // word-boundary match means the stale 'email' symbol is NOT referenced, so
    // there is no deny. No claimed file is in the db.users area either -> no
    // inject. The guard must ALLOW the stop.
    cwd = makeCwd({
      session_id: "sess-ben",
      human: "ben",
      branch: "ben/api",
      last_synced_version: 7,
      claim_files: ["routes/invites.ts"],
      claim_symbols: ["user.contact_email", ".contact_email"],
      bus_url: bus.url,
    });

    const stop = { session_id: "sess-ben", cwd };
    const res = await runHook(JSON.stringify(stop), cwd);

    assert.equal(res.status, 0, `swapped-to-contact_email session allows the stop. stderr: ${res.stderr}`);
    assert.equal(res.stdout.trim(), "", "no block payload on the allow path");
  } finally {
    await bus.close();
    try {
      rmSync(dir, { recursive: true, force: true });
      if (cwd) rmSync(cwd, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
});

test("stop-guard (4): bus down (unreachable) -> ALLOW (fail-open) + a warning line logged", async () => {
  // Point at a port nothing is listening on (fail-open path).
  const busUrl = "http://127.0.0.1:9"; // discard port; connection refused fast
  const cwd = makeCwd({
    session_id: "sess-ben",
    human: "ben",
    branch: "ben/api",
    last_synced_version: 7,
    claim_files: ["routes/users.ts"],
    claim_symbols: ["user.email", ".email"], // would block IF the bus were reachable
    bus_url: busUrl,
  });

  try {
    const stop = { session_id: "sess-ben", cwd };
    const res = await runHook(JSON.stringify(stop), cwd);

    // FAIL OPEN: the stop is allowed even though the diff would otherwise block.
    assert.equal(res.status, 0, `bus down -> guard fails open and allows the stop. stderr: ${res.stderr}`);

    // a warning line was appended to .datum/warnings.log.
    const warnPath = join(cwd, ".datum", "warnings.log");
    assert.ok(existsSync(warnPath), "warnings.log was created on fail-open");
    const log = readFileSync(warnPath, "utf8");
    assert.match(log, /guard fail-open/);
  } finally {
    try {
      rmSync(cwd, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
});
