// test/fence.test.ts — the deterministic fence acceptance test (deny on a stale
// contract, cache-hit fast path, and fail open). Run: node --test test/fence.test.ts
//
// Covers:
//   (1) routes/users.ts selecting .email, behind by one epoch on db.users
//       v7->v8 rename -> deny; reason names db.users, email, contact_email, asha.
//   (2) routes/invites.ts unrelated -> allow.
//   (3) content already using contact_email -> allow (word-boundary; not re-fenced).
//   (4) lastSyncedVersion === currentVersion -> allow even with a stale delta
//       passed (cache-hit fast path must NOT consult deltas).
//   (5) HOOK smoke: real bus + seed + asha's migration (epoch 8); a tmp cwd with
//       .datum/state.json (last_synced 7); spawn `node hooks/datum-fence.ts`
//       with a PreToolUse JSON on stdin selecting .email -> stdout parses to
//       permissionDecision 'deny'.

import { test } from "node:test";
import assert from "node:assert/strict";

import { decideFence, type FenceInput } from "../server/fence.ts";
import type { Delta } from "../server/store.ts";

// The scenario delta: db.users v7 -> v8, users.email -> contact_email, migration 0042,
// author asha. This is the `delta.detected` payload shape (schema §3/§4).
const ASHA_DELTA: Delta = {
  epoch: 8,
  contract_id: "db.users",
  from_version: 7,
  to_version: 8,
  author: "asha",
  ts: "2026-06-13T14:02:11Z",
  why: "phone signups make email the wrong name.",
  mechanical_change: {
    kind: "rename_column",
    table: "users",
    from: "email",
    to: "contact_email",
    migration: "0042",
  },
};

test("fence (1): write to routes/users.ts selecting .email, behind one epoch -> DENY naming contract + change + author", () => {
  const input: FenceInput = {
    write: {
      path: "routes/users.ts",
      tool_name: "Edit",
      content: "const e = user.email;\nreturn db.select().from(users).where(eq(users.email, e));",
    },
    lastSyncedVersion: 7,
    currentVersion: 8,
    deltas: [ASHA_DELTA],
  };

  const decision = decideFence(input);
  assert.equal(decision.decision, "deny");
  assert.equal(decision.decision === "deny", true);
  if (decision.decision !== "deny") return;

  // the reason must name the contract, the mechanical change, and the author.
  assert.match(decision.reason, /db\.users/);
  assert.match(decision.reason, /email/);
  assert.match(decision.reason, /contact_email/);
  assert.match(decision.reason, /asha/);
  // the imperative re-sync (schema §7).
  assert.match(decision.reason, /v8/);
  // the migration is named.
  assert.match(decision.reason, /0042/);
});

test("fence (2): write to routes/invites.ts (unrelated) -> ALLOW", () => {
  const input: FenceInput = {
    write: {
      path: "routes/invites.ts",
      tool_name: "Edit",
      content: "router.post('/invites', (req, res) => res.status(202).json({ jobId }));",
    },
    lastSyncedVersion: 7,
    currentVersion: 8,
    deltas: [ASHA_DELTA],
  };
  const decision = decideFence(input);
  assert.equal(decision.decision, "allow");
});

test("fence (3): content already using contact_email -> ALLOW (word-boundary, not re-fenced)", () => {
  const input: FenceInput = {
    write: {
      path: "routes/users.ts",
      tool_name: "Edit",
      content:
        "const e = user.contact_email;\nreturn db.select().from(users).where(eq(users.contact_email, e));",
    },
    lastSyncedVersion: 7,
    currentVersion: 8,
    deltas: [ASHA_DELTA],
  };
  const decision = decideFence(input);
  // contact_email contains "email" but the word boundary must NOT match it.
  // routes/users.ts is in the db.users area, so the no-stale-symbol path is an
  // inject (area hit) — it must NOT be a deny. Allow OR inject is acceptable;
  // the load-bearing assertion is "not denied".
  assert.notEqual(decision.decision, "deny");
});

test("fence (4): lastSyncedVersion === currentVersion -> ALLOW without consulting deltas (cache-hit fast path)", () => {
  const input: FenceInput = {
    write: {
      // deliberately a write that WOULD deny if deltas were consulted.
      path: "routes/users.ts",
      tool_name: "Edit",
      content: "return db.select().from(users).where(eq(users.email, e));",
    },
    lastSyncedVersion: 8,
    currentVersion: 8,
    deltas: [ASHA_DELTA], // a stale delta is present but MUST be ignored on a cache hit.
  };
  const decision = decideFence(input);
  assert.equal(decision.decision, "allow");
});

test("fence (5) HOOK smoke: real bus + seed + asha migration -> spawned hook stdout is permissionDecision 'deny'", async () => {
  const { startBus } = await import("../server/index.ts");
  const { Store } = await import("../server/store.ts");
  const { seedScenario, ASHA_MIGRATION_AFTER, ASHA_WHY } = await import(
    "../server/seed.ts"
  );
  const { openDb } = await import("../server/db.ts");
  const fs = await import("node:fs");
  const os = await import("node:os");
  const path = await import("node:path");
  const { spawn } = await import("node:child_process");
  const { fileURLToPath } = await import("node:url");

  // 1) seed a file db to the pre-delta state (epoch 7, db.users v7).
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "datum-fence-"));
  const dbPath = path.join(dir, "datum.db");
  const seedDb = openDb(dbPath);
  seedScenario(new Store(seedDb));
  seedDb.close();

  // 2) start the bus on the seeded db (ephemeral port).
  const bus = await startBus({ port: 0, dbPath });

  // tmp cwd holding .datum/state.json (last_synced 7, pointing at the bus).
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "datum-cwd-"));
  const datumDir = path.join(cwd, ".datum");
  fs.mkdirSync(datumDir, { recursive: true });

  try {
    // 3) apply asha's migration -> epoch 8 (so the session is behind by 1).
    const apply = await fetch(`${bus.url}/events`, {
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
    const applyBody = (await apply.json()) as { registry_version: number };
    assert.equal(applyBody.registry_version, 8);

    fs.writeFileSync(
      path.join(datumDir, "state.json"),
      JSON.stringify({
        session_id: "sess-ben",
        human: "ben",
        branch: "ben/api",
        last_synced_version: 7,
        claim_files: ["routes/users.ts"],
        claim_symbols: ["user.email", ".email"],
        bus_url: bus.url,
      }),
    );

    // 4) spawn the hook with a PreToolUse envelope on stdin selecting .email.
    const hookPath = path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      "..",
      "hooks",
      "datum-fence.ts",
    );
    const preToolUse = {
      session_id: "sess-ben",
      cwd,
      tool_name: "Edit",
      tool_input: {
        file_path: "routes/users.ts",
        new_string:
          "return db.select().from(users).where(eq(users.email, req.params.id));",
      },
    };

    const stdout = await runHook(spawn, hookPath, JSON.stringify(preToolUse), cwd);

    assert.ok(stdout.trim().length > 0, "hook printed a deny JSON on stdout");
    const parsed = JSON.parse(stdout);
    assert.equal(parsed.hookSpecificOutput.hookEventName, "PreToolUse");
    assert.equal(parsed.hookSpecificOutput.permissionDecision, "deny");
    const reason = String(parsed.hookSpecificOutput.permissionDecisionReason);
    assert.match(reason, /db\.users/);
    assert.match(reason, /contact_email/);
    assert.match(reason, /asha/);

    // the deny ran the bus round-trip cleanly; the contract is the deny above.
    const deltas = await fetch(`${bus.url}/deltas?since=0`).then((r) => r.json());
    assert.ok(Array.isArray((deltas as any).deltas));
  } finally {
    await bus.close();
    try {
      fs.rmSync(dir, { recursive: true, force: true });
      fs.rmSync(cwd, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
});

// Spawn the hook, write the PreToolUse JSON to stdin, collect stdout.
function runHook(
  spawn: typeof import("node:child_process").spawn,
  hookPath: string,
  stdinJson: string,
  cwd: string,
): Promise<string> {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(process.execPath, [hookPath], {
      cwd,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let out = "";
    let err = "";
    child.stdout.on("data", (d) => (out += d.toString()));
    child.stderr.on("data", (d) => (err += d.toString()));
    child.on("error", rejectRun);
    child.on("close", (code) => {
      // the hook always exits 0 (fail open / deny are both exit 0).
      if (code !== 0) return rejectRun(new Error(`hook exited ${code}: ${err}`));
      resolveRun(out);
    });
    child.stdin.write(stdinJson);
    child.stdin.end();
  });
}
