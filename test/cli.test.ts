// test/cli.test.ts — the datum CLI acceptance suite (docs/prd/cli.md §"Acceptance
// test"). Drives the router (run) against an ephemeral SEEDED bus (epoch 8 after
// asha's migration) + a tmp .datum/state.json, capturing stdout. Asserts the
// grouped help, version, status (text + json), registry/log/show json, the fence
// dry-run (deny -> exit 2 naming db.users/email/contact_email/asha), doctor exit
// codes, decide epoch-neutrality, unknown-command, bus-down fail-soft, and the
// no-color / non-TTY ANSI discipline.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { startBus } from "../server/index.ts";
import { Store } from "../server/store.ts";
import { seedScenario, ASHA_MIGRATION_AFTER, ASHA_WHY } from "../server/seed.ts";
import { openDb } from "../server/db.ts";

import { run, parseArgv } from "../cli/datum.ts";
import { enableColor, disableColor, stripAnsi, captureOutput } from "../cli/lib/format.ts";
import type { DatumState } from "../cli/lib/state.ts";

// ---- harness ----

let bus: { url: string; close: () => Promise<void> };
let projectDir: string;
let dbDir: string;

/** Capture cockpit output during run(argv). Returns { out, err, code }. */
async function capture(argv: string[]): Promise<{ out: string; err: string; code: number }> {
  const cap = await captureOutput(() => run(argv));
  return { out: cap.stdout, err: cap.stderr, code: cap.result };
}

function writeState(state: Partial<DatumState>): void {
  const full: DatumState = {
    session_id: "sess-ben",
    human: "ben",
    branch: "ben/api",
    last_synced_version: 7,
    claim_files: ["routes/users.ts"],
    claim_symbols: ["user.email", ".email"],
    bus_url: bus.url,
    ...state,
  };
  mkdirSync(join(projectDir, ".datum"), { recursive: true });
  writeFileSync(join(projectDir, ".datum", "state.json"), JSON.stringify(full, null, 2) + "\n");
}

before(async () => {
  // 1) seed a file db to the pre-delta state (epoch 7).
  dbDir = mkdtempSync(join(tmpdir(), "datum-cli-db-"));
  const dbPath = join(dbDir, "datum.db");
  const seedDb = openDb(dbPath);
  seedScenario(new Store(seedDb));
  seedDb.close();

  // 2) start the bus on the seeded db.
  bus = await startBus({ port: 0, dbPath });

  // 3) apply asha's migration through the bus -> epoch 8, delta.detected, #112.
  const editRes = await fetch(`${bus.url}/events`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      type: "edit.streamed",
      session_id: "sess-asha",
      human: "asha",
      tool_name: "Write",
      path: "migrations/0042_rename_users_email.sql",
      after: ASHA_MIGRATION_AFTER,
      why: ASHA_WHY,
    }),
  });
  const body = (await editRes.json()) as { registry_version: number };
  assert.equal(body.registry_version, 8, "asha migration should bump epoch to 8");

  // 4) tmp project dir + ben's behind-by-one state (last_synced_version 7).
  projectDir = mkdtempSync(join(tmpdir(), "datum-cli-proj-"));
  process.env.CLAUDE_PROJECT_DIR = projectDir;
  process.env.DATUM_BUS_URL = bus.url;
  writeState({});
  disableColor(); // tests assert plain text by default.
});

after(async () => {
  await bus?.close();
  delete process.env.CLAUDE_PROJECT_DIR;
  delete process.env.DATUM_BUS_URL;
  try {
    rmSync(projectDir, { recursive: true, force: true });
    rmSync(dbDir, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
});

// ---- arg parsing ----

test("parseArgv: command + positional + value/boolean flags", () => {
  const p = parseArgv(["check", "routes/users.ts", "--content", "-", "--json"]);
  assert.equal(p.command, "check");
  assert.deepEqual(p.args, ["routes/users.ts"]);
  assert.equal(p.flags.content, "-");
  assert.equal(p.flags.json, true);
});

// ---- help: grouped commands, exit 0 ----

test("help lists the grouped commands and exits 0", async () => {
  const { out, code } = await capture(["help"]);
  assert.equal(code, 0);
  assert.match(out, /lifecycle/i);
  assert.match(out, /cockpit/i);
  assert.match(out, /truth/i);
  // a sampling of commands across groups.
  for (const cmd of ["status", "sync", "check", "registry", "log", "decide", "doctor", "init"]) {
    assert.match(out, new RegExp(`\\b${cmd}\\b`), `help should mention ${cmd}`);
  }
});

test("--help (global) lists grouped commands and exits 0", async () => {
  const { out, code } = await capture(["--help"]);
  assert.equal(code, 0);
  assert.match(out, /cockpit/i);
});

test("help <command> prints per-command usage", async () => {
  const { out, code } = await capture(["help", "check"]);
  assert.equal(code, 0);
  assert.match(out, /datum check/);
  assert.match(out, /deny/i);
});

// ---- version ----

test("version prints a version + node + bus", async () => {
  const { out, code } = await capture(["version"]);
  assert.equal(code, 0);
  assert.match(out, /datum \d+\.\d+\.\d+/);
  assert.match(out, /node v/);
});

// ---- status (text + json) shows epoch 8 + sync state ----

test("status (text) shows epoch 8 and the off-datum sync state", async () => {
  const { out, code } = await capture(["status"]);
  assert.equal(code, 0);
  assert.match(out, /v8/);
  assert.match(out, /off datum by 1 version/);
});

test("status --json shows epoch 8 and behind=1", async () => {
  const { out, code } = await capture(["status", "--json"]);
  assert.equal(code, 0);
  const json = JSON.parse(out);
  assert.equal(json.epoch, 8);
  assert.equal(json.behind, 1);
  assert.equal(json.bus_reachable, true);
  assert.equal(json.last_synced_version, 7);
});

// ---- registry --json lists db.users v8 ----

test("registry --json lists db.users at v8", async () => {
  const { out, code } = await capture(["registry", "--json"]);
  assert.equal(code, 0);
  const json = JSON.parse(out);
  assert.equal(json.registry_version, 8);
  const dbUsers = json.contracts.find((c: any) => c.id === "db.users");
  assert.ok(dbUsers, "db.users present");
  assert.equal(dbUsers.version, 8);
});

test("truth alias resolves to registry", async () => {
  const { out, code } = await capture(["truth", "--json"]);
  assert.equal(code, 0);
  assert.equal(JSON.parse(out).registry_version, 8);
});

// ---- log --json shows ledger #112/#111/#110 ----

test("log --json shows the ledger #112/#111/#110 newest-first", async () => {
  const { out, code } = await capture(["log", "--json"]);
  assert.equal(code, 0);
  const json = JSON.parse(out);
  const ids = json.ledger.map((e: any) => e.id);
  assert.deepEqual(ids.slice(0, 3), [112, 111, 110]);
  // #112 is asha's rename (created live by the delta).
  const e112 = json.ledger.find((e: any) => e.id === 112);
  assert.equal(e112.author, "asha");
});

test("ledger alias resolves to log", async () => {
  const { code } = await capture(["ledger", "--json"]);
  assert.equal(code, 0);
});

// ---- show db.users includes the rename history ----

test("show db.users includes the email -> contact_email rename", async () => {
  const { out, code } = await capture(["show", "db.users"]);
  assert.equal(code, 0);
  assert.match(out, /db\.users/);
  assert.match(out, /email/);
  assert.match(out, /contact_email/);
});

test("show db.users --json carries the rename mechanical change + asha", async () => {
  const { out, code } = await capture(["show", "db.users", "--json"]);
  assert.equal(code, 0);
  const json = JSON.parse(out);
  const v8 = json.versions.find((v: any) => v.version === 8);
  assert.ok(v8, "v8 version row present");
  assert.equal(v8.mechanical_change.kind, "rename_column");
  assert.equal(v8.mechanical_change.from, "email");
  assert.equal(v8.mechanical_change.to, "contact_email");
  assert.equal(v8.author, "asha");
});

// ---- check on a .email write while behind -> exit 2 + deny reason ----

test("check on a .email write while behind -> exit 2 + deny names db.users/email/contact_email/asha", async () => {
  const { out, code } = await capture([
    "check",
    "routes/users.ts",
    "--content",
    "const u = await db.query('select .email from users')",
  ]);
  assert.equal(code, 2, "deny -> exit 2 (drift)");
  assert.match(out, /deny/i);
  assert.match(out, /db\.users/);
  assert.match(out, /email/);
  assert.match(out, /contact_email/);
  assert.match(out, /asha/);
});

test("check --json on the .email write reports decision deny", async () => {
  const { out, code } = await capture([
    "check",
    "routes/users.ts",
    "--json",
    "--content",
    "user.email",
  ]);
  assert.equal(code, 2);
  assert.equal(JSON.parse(out).decision, "deny");
});

test("check on an unrelated write -> allow, exit 0", async () => {
  const { out, code } = await capture([
    "check",
    "routes/invites.ts",
    "--content",
    "const x = await db.query('select id from invites')",
  ]);
  assert.equal(code, 0);
  assert.match(out, /allow/i);
});

test("check using the migrated symbol (contact_email) is not denied -> exit 0", async () => {
  const { code } = await capture([
    "check",
    "routes/users.ts",
    "--content",
    "const u = await db.query('select contact_email from users')",
  ]);
  // routes/users.ts is in db.users' area, so this is allow-or-inject, never deny.
  assert.equal(code, 0);
});

// ---- doctor: reachable bus + behind -> exit 2; synced -> exit 0 ----

test("doctor reports wired hooks + reachable bus, exit 2 when behind", async () => {
  // wire a settings.json so the hook/mcp checks pass (init writes the block).
  const { code: initCode } = await capture(["init", "--human", "ben", "--branch", "ben/api"]);
  assert.equal(initCode, 0);
  // init resets last_synced_version handling but keeps ours; force behind state.
  writeState({ last_synced_version: 7 });

  const { out, code } = await capture(["doctor"]);
  assert.match(out, /bus reachable/i);
  assert.match(out, /SessionStart/);
  assert.match(out, /PreToolUse/);
  assert.match(out, /mcpServers\.datum/);
  assert.equal(code, 2, "behind the epoch -> drift exit 2");
});

test("doctor --json exit 0 when synced to the current epoch", async () => {
  writeState({ last_synced_version: 8 });
  const { out, code } = await capture(["doctor", "--json"]);
  const json = JSON.parse(out);
  assert.equal(code, 0);
  assert.equal(json.ok, true);
  const busCheck = json.checks.find((c: any) => /bus reachable/i.test(c.check));
  assert.equal(busCheck.pass, true);
  // restore behind state for later tests.
  writeState({ last_synced_version: 7 });
});

// ---- sync advances last_synced_version + prints what changed ----

test("sync advances to v8 and reports the rename delta", async () => {
  writeState({ last_synced_version: 7 });
  const { out, code } = await capture(["sync"]);
  assert.equal(code, 0);
  assert.match(out, /v8/);
  assert.match(out, /contact_email|email/);
  // after sync, status should be synced.
  const after = await capture(["status", "--json"]);
  assert.equal(JSON.parse(after.out).behind, 0);
  writeState({ last_synced_version: 7 }); // restore
});

// ---- decide: epoch-neutral ----

test("decide records a free-form decision, epoch-neutral (registry stays v8)", async () => {
  const before = JSON.parse((await capture(["status", "--json"])).out).epoch;
  const { out, code } = await capture(["decide", "use SSE for the tower", "--author", "ben"]);
  assert.equal(code, 0);
  assert.match(out, /recorded|#\d+/i);
  const v = await fetch(`${bus.url}/version`).then((r) => r.json() as Promise<{ registry_version: number }>);
  assert.equal(v.registry_version, before, "decide is epoch-neutral");
});

test("decide --json returns ledger_id + epoch_neutral", async () => {
  const { out, code } = await capture(["decide", "another decision", "--author", "ben", "--json"]);
  assert.equal(code, 0);
  const json = JSON.parse(out);
  assert.equal(json.epoch_neutral, true);
  assert.ok(typeof json.ledger_id === "number");
});

// ---- claim ----

test("claim with no args prints the current claim", async () => {
  writeState({});
  const { out, code } = await capture(["claim", "--json"]);
  assert.equal(code, 0);
  const json = JSON.parse(out);
  assert.deepEqual(json.claim_files, ["routes/users.ts"]);
});

test("claim sets a new scope and persists it", async () => {
  writeState({});
  const { code } = await capture(["claim", "routes/admin.ts", "--symbols", "admin.role"]);
  assert.equal(code, 0);
  const { out } = await capture(["claim", "--json"]);
  const json = JSON.parse(out);
  assert.deepEqual(json.claim_files, ["routes/admin.ts"]);
  assert.deepEqual(json.claim_symbols, ["admin.role"]);
  writeState({}); // restore
});

// ---- advisories ----

test("advisories --json returns an array (empty when none seeded for ben)", async () => {
  const { out, code } = await capture(["advisories", "--json"]);
  assert.equal(code, 0);
  assert.ok(Array.isArray(JSON.parse(out).advisories));
});

// ---- unknown command -> usage + exit 1 ----

test("unknown command -> usage + exit 1", async () => {
  const { out, err, code } = await capture(["frobnicate"]);
  assert.equal(code, 1);
  // usage is printed (grouped help), error names the bad command on stderr.
  assert.match(out, /cockpit/i);
  assert.match(err, /unknown command/i);
});

// ---- bus-down -> fail-soft (no throw, local view) ----

test("bus-down -> fail-soft local view, no throw", async () => {
  process.env.DATUM_BUS_URL = "http://127.0.0.1:59599"; // nothing listening
  try {
    const { out, code } = await capture(["status"]);
    assert.equal(code, 0, "fail-soft status still exits 0");
    assert.match(out, /local cache|unreachable/i);
    assert.doesNotMatch(out, /at Object|at async|Error:/);
  } finally {
    process.env.DATUM_BUS_URL = bus.url;
  }
});

test("bus-down -> registry warns + exits 1 (no stack trace)", async () => {
  process.env.DATUM_BUS_URL = "http://127.0.0.1:59599";
  try {
    const { err, code } = await capture(["registry"]);
    assert.equal(code, 1);
    assert.match(err, /unreachable/i);
    assert.doesNotMatch(err, /at async|\.ts:\d+/);
  } finally {
    process.env.DATUM_BUS_URL = bus.url;
  }
});

// ---- --no-color / non-TTY emits no ANSI ----

test("--no-color emits no ANSI escapes", async () => {
  const { out } = await capture(["status", "--no-color"]);
  assert.equal(out, stripAnsi(out), "no ANSI escapes when --no-color");
  assert.doesNotMatch(out, /\x1b\[/);
});

test("color, when enabled, does emit ANSI then disables for the rest of the suite", async () => {
  enableColor();
  const { out } = await capture(["version"]);
  // run() honors --json/--no-color but with neither set and color enabled, escapes appear.
  // (status/version use ident() for the version which is plain; the ⌖ mark is amber.)
  assert.match(out, /\x1b\[/);
  disableColor();
  const plain = await capture(["version"]);
  assert.doesNotMatch(plain.out, /\x1b\[/);
});

// ---- bare datum -> status when state exists ----

test("bare `datum` with state present renders status (epoch line)", async () => {
  const { out, code } = await capture([]);
  assert.equal(code, 0);
  assert.match(out, /epoch/);
});
