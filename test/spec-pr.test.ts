// test/spec-pr.test.ts — the spec-pr acceptance test (fully offline + deterministic).
//
// Satisfies RUBRIC: "The arbiter opens a real PR that patches docs/spec.md to
// the new contract truth, with a linked ledger entry" (+ the `datum demo` clause
// "one spec PR is opened"). Runs with useGh:false so it is deterministic and
// touches no network and no GitHub (not-a-dashboard: the web app is stopped).
//
// Flow: build a tmp git repo with a docs/spec.md fixture referencing
// "users.email"; fire asha's hero delta through the real registry; call
// openSpecPR(heroDelta, 112, {repoDir, useGh:false}); assert the spec is patched
// to contact_email (migration 0042 noted), a local PR artifact (pr.json + .patch)
// exists on a new branch, and exactly one spec.pr.opened event fires with the
// schema §3 payload. Then assert idempotency: a second call opens no duplicate.
//
// Run: node --test test/spec-pr.test.ts

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { openDb, close as closeDb } from "../server/db.ts";
import { Store } from "../server/store.ts";
import { applyEdit } from "../server/registry.ts";
import { seedScenario, ASHA_MIGRATION_AFTER, ASHA_WHY } from "../server/seed.ts";

import { openSpecPR, applyDeltaToSpec } from "../server/arbiter/spec-pr.ts";
import type { Delta } from "../server/store.ts";

// ---- fixtures ----

const SPEC_FIXTURE = `# Spec — workspace invites

## db.users

The users table has columns id, users.email, and name.
The API selects users.email when rendering a user.
Frontend UserCard reads user.email at line 18.
`;

function gitInitRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), "datum-specpr-"));
  const run = (args: string[]) => {
    const r = spawnSync("git", args, { cwd: dir, encoding: "utf8" });
    assert.equal(r.status, 0, `git ${args.join(" ")} failed: ${r.stderr}`);
  };
  run(["init", "-q"]);
  run(["config", "user.email", "test@datum.local"]);
  run(["config", "user.name", "datum-test"]);
  run(["checkout", "-q", "-B", "main"]);
  mkdirSync(join(dir, "docs"), { recursive: true });
  writeFileSync(join(dir, "docs", "spec.md"), SPEC_FIXTURE);
  run(["add", "docs/spec.md"]);
  run(["commit", "-q", "-m", "seed: docs/spec.md"]);
  return dir;
}

/** Seed + fire asha's hero delta via the real registry; return the delta + store. */
function heroDelta(): { store: Store; delta: Delta; db: ReturnType<typeof openDb> } {
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

/** A clean store used only as the spec.pr.opened event sink. */
function eventSink(): { store: Store; db: ReturnType<typeof openDb> } {
  const db = openDb(":memory:");
  return { store: new Store(db), db };
}

// ---- pure-function unit: the spec patch ----

test("applyDeltaToSpec: rewrites users.email -> contact_email and notes migration 0042", () => {
  const { delta, db } = heroDelta();
  const { text, changed } = applyDeltaToSpec(SPEC_FIXTURE, delta);
  assert.ok(changed, "the spec changed");
  assert.match(text, /contact_email/, "contains contact_email");
  assert.doesNotMatch(text, /\busers\.email\b/, "no bare users.email remains");
  assert.match(text, /0042/, "migration 0042 noted");
  closeDb(db);
});

// ---- acceptance: open the local PR ----

test("openSpecPR: patches docs/spec.md, opens a local PR artifact, links #112, emits one spec.pr.opened", async () => {
  const repoDir = gitInitRepo();
  const { delta, db: ddb } = heroDelta();
  const sink = eventSink();

  try {
    const result = await openSpecPR(delta, 112, {
      repoDir,
      useGh: false,
      store: sink.store,
    });

    // ---- the spec is patched on disk ----
    const specText = readFileSync(join(repoDir, "docs", "spec.md"), "utf8");
    assert.match(specText, /contact_email/, "spec now references contact_email");
    assert.doesNotMatch(specText, /\busers\.email\b/, "spec has no bare users.email");
    assert.match(specText, /0042/, "migration 0042 noted in the spec");

    // ---- the result shape (schema §3 spec.pr.opened payload) ----
    assert.equal(result.patch_path, "docs/spec.md");
    assert.equal(result.epoch, 8);
    assert.equal(result.ledger_id, 112);
    assert.equal(result.contract_id, "db.users");
    assert.ok(Number.isFinite(result.pr_number) && result.pr_number > 0, "non-empty pr_number");
    assert.equal(result.pr_number, 14, "hero epoch opens PR #14");
    assert.ok(typeof result.url === "string" && result.url.length > 0, "non-empty url");

    // ---- the patch landed on a NEW branch (datum/spec-v8) ----
    const branches = spawnSync("git", ["branch", "--list", "datum/spec-v8"], {
      cwd: repoDir,
      encoding: "utf8",
    });
    assert.match(branches.stdout, /datum\/spec-v8/, "datum/spec-v8 branch exists");
    const head = spawnSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
      cwd: repoDir,
      encoding: "utf8",
    });
    assert.equal(head.stdout.trim(), "datum/spec-v8", "HEAD is on the spec branch");

    // ---- the local PR artifact exists (pr.json + .patch) ----
    const prJson = join(repoDir, ".datum-pr", "pr.json");
    const patchFile = join(repoDir, ".datum-pr", "spec-v8.patch");
    assert.ok(existsSync(prJson), "pr.json artifact exists");
    assert.ok(existsSync(patchFile), ".patch artifact exists");
    const pr = JSON.parse(readFileSync(prJson, "utf8")) as Record<string, unknown>;
    assert.equal(pr.ledger_id, 112, "pr.json links ledger #112");
    assert.equal(pr.branch, "datum/spec-v8");
    assert.equal(pr.base, "main");
    assert.ok(String(pr.title).length > 0, "pr.json has a title");
    assert.ok(String(pr.body).length > 0, "pr.json has a body");
    // the patch text is a real git diff that renames email -> contact_email.
    const patchText = readFileSync(patchFile, "utf8");
    assert.match(patchText, /contact_email/, "patch contains the rename");

    // ---- exactly one spec.pr.opened event, with the §3 payload ----
    const opened = sink.store.getEventsSince(0).filter((e) => e.type === "spec.pr.opened");
    assert.equal(opened.length, 1, "exactly one spec.pr.opened event");
    const p = opened[0].payload as Record<string, unknown>;
    assert.equal(p.patch_path, "docs/spec.md");
    assert.equal(p.epoch, 8);
    assert.equal(p.ledger_id, 112);
    assert.equal(p.contract_id, "db.users");
    assert.ok(typeof p.pr_number === "number" && (p.pr_number as number) > 0, "non-empty pr_number");
    assert.ok(typeof p.url === "string" && (p.url as string).length > 0, "non-empty url");
  } finally {
    closeDb(ddb);
    closeDb(sink.db);
    rmSync(repoDir, { recursive: true, force: true });
  }
});

// ---- acceptance: idempotency ----

test("openSpecPR: idempotent — a second call opens no duplicate PR and does not rewrite the ledger", async () => {
  const repoDir = gitInitRepo();
  const { delta, db: ddb } = heroDelta();
  const sink = eventSink();

  try {
    const first = await openSpecPR(delta, 112, { repoDir, useGh: false, store: sink.store });
    const prJsonBefore = readFileSync(join(repoDir, ".datum-pr", "pr.json"), "utf8");

    const second = await openSpecPR(delta, 112, { repoDir, useGh: false, store: sink.store });

    // same PR coordinates — no duplicate opened.
    assert.equal(second.pr_number, first.pr_number, "same pr_number");
    assert.equal(second.url, first.url, "same url");
    assert.equal(second.ledger_id, 112, "ledger still #112");

    // pr.json unchanged (no double-write / no rewrite of the linked ledger).
    const prJsonAfter = readFileSync(join(repoDir, ".datum-pr", "pr.json"), "utf8");
    assert.equal(prJsonAfter, prJsonBefore, "pr.json unchanged on the second call");

    // only ONE spec.pr.opened patch artifact for this epoch.
    assert.ok(existsSync(join(repoDir, ".datum-pr", "spec-v8.patch")), "patch still present");

    // the spec is still patched and still has no bare users.email (no double-apply damage).
    const specText = readFileSync(join(repoDir, "docs", "spec.md"), "utf8");
    assert.match(specText, /contact_email/);
    assert.doesNotMatch(specText, /\busers\.email\b/);
  } finally {
    closeDb(ddb);
    closeDb(sink.db);
    rmSync(repoDir, { recursive: true, force: true });
  }
});
