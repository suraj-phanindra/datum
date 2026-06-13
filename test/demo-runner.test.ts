// test/demo-runner.test.ts — the demo-runner acceptance test.
//
//   node --test test/demo-runner.test.ts
//
// Asserts the exit SEMANTICS of demo/datum-demo.ts (the headless verifier):
//   1. happy path: `node demo/datum-demo.ts` exits 0, and each of the SIX
//      predicates is reported PASS in the green checklist.
//   2. not-a-dashboard: the runner reports it started NO tower process (the web
//      app is stopped throughout) and listens on no tower port.
//   3. negative case: forcing one predicate to fail (DATUM_DEMO_BREAK=fence)
//      makes the runner exit non-zero and name the broken predicate.
//
// Runs are ephemeral + isolated: the runner uses an in-memory bus (:memory:) and
// rebuilds its seed repo each run, so nothing leaks between cases. The happy path
// forces DATUM_DEMO_BREAK=model so the arbiter uses the deterministic offline
// fixture (no network / no `claude` CLI) — the predicate set + exit code are
// unchanged by that flag, only the advisory PROSE source is. The real Opus +
// real spec-pr paths are exercised by their own acceptance runs (RECONCILIATION
// gate 2: test/advisory-shape.test.ts, test/spec-pr.test.ts).

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const DEMO = join(HERE, "..", "demo", "datum-demo.ts");

// The six predicate labels the runner prints (must all be PASS on the happy path).
const SIX_PREDICATES = [
  "registry advances to v8",
  "exactly one write is fenced",
  "two advisories are delivered",
  "the two advisories differ",
  "one spec PR is opened",
  "three branches merge clean",
];

type Run = { status: number; stdout: string; stderr: string };

/** Spawn the headless runner with an isolated env; return exit + captured output. */
function runDemo(env: Record<string, string> = {}): Run {
  const r = spawnSync(process.execPath, [DEMO], {
    encoding: "utf8",
    timeout: 60_000,
    env: {
      ...process.env,
      // force the deterministic offline fixture for the arbiter prose so the
      // test never touches the network or the local `claude` CLI. This flag is
      // independent of DATUM_DEMO_BREAK, so the negative cases stay hermetic +
      // fast while still breaking the predicate under test.
      DATUM_DEMO_FIXTURE: "1",
      ...env,
    },
  });
  return {
    status: r.status ?? 1,
    stdout: r.stdout ?? "",
    stderr: r.stderr ?? "",
  };
}

// ---- 1) happy path: exit 0 + all six predicates PASS ----

test("datum demo: headless runner exits 0 and reports all six predicates PASS", () => {
  const run = runDemo();
  assert.equal(run.status, 0, `expected exit 0, got ${run.status}\n${run.stdout}\n${run.stderr}`);

  // the green summary line is printed only when ALL predicates hold.
  assert.match(run.stdout, /ALL SIX PREDICATES HOLD/, "green summary line printed");

  // each of the six predicates is individually reported PASS.
  for (const label of SIX_PREDICATES) {
    const line = new RegExp(`\\[PASS\\][^\\n]*${escapeRe(label)}`);
    assert.match(run.stdout, line, `predicate reported PASS: "${label}"`);
  }
  // and NONE is reported FAIL.
  assert.doesNotMatch(run.stdout, /\[FAIL\]/, "no predicate reported FAIL on the happy path");
});

// ---- 2) not-a-dashboard: no tower process / port ----

test("datum demo: not-a-dashboard — no tower process is started", () => {
  const run = runDemo();
  assert.equal(run.status, 0, "happy path still exits 0");
  assert.match(
    run.stdout,
    /not-a-dashboard:\s*no tower process started/i,
    "runner reports it started no tower process (web app stopped)",
  );
  // the runner must not print any web-tower listening banner.
  assert.doesNotMatch(run.stdout, /tower (listening|serving) on/i, "no tower listening banner");
});

// ---- 3) negative case: force one predicate to fail -> exit != 0 ----

test("datum demo: DATUM_DEMO_BREAK=fence forces a failure -> non-zero exit", () => {
  const run = runDemo({ DATUM_DEMO_BREAK: "fence" });
  assert.notEqual(run.status, 0, "forced fence break must exit non-zero");
  assert.match(run.stdout, /DEMO FAILED/, "failure summary printed");
  assert.match(
    run.stdout,
    /exactly_one_fenced/,
    "the failure names the broken fence predicate",
  );
  // the green line must NOT appear when a predicate is broken.
  assert.doesNotMatch(run.stdout, /ALL SIX PREDICATES HOLD/, "no green summary on failure");
});

// ---- 4) negative case (second predicate) for breadth ----

test("datum demo: DATUM_DEMO_BREAK=merge (branch conflict) -> non-zero exit", () => {
  const run = runDemo({ DATUM_DEMO_BREAK: "merge" });
  assert.notEqual(run.status, 0, "forced merge conflict must exit non-zero");
  assert.match(run.stdout, /three_branches_merge/, "the failure names the merge predicate");
});

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
