// test/datum-join-seed.test.ts — the zero-init self-seed in the SessionStart hook.
//
// When a plugin install brings no separate `datum init`, datum-join must seed
// .datum/state.json from the git-native helpers before registering the session.
// These tests run the REAL hook (hooks/datum-join.ts) in a temp git repo with no
// bus running: seeding happens before the bus call, so the hook fails open (the
// bus is unreachable) yet the seeded state.json is still written. We assert it
//   - pulls identity (human/email/branch) from git config + the remote workspace,
//   - applies the bus_url precedence committed datum.json > env > default, and
//   - leaves an existing valid state untouched (idempotent).

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync, spawn } from "node:child_process";

const HOOK = join(import.meta.dirname, "..", "hooks", "datum-join.ts");

/** Make a tmp git repo with a name/email/branch + (optional) origin remote. */
function makeRepo(opts: { remote?: string; name?: string; email?: string; branch?: string }): string {
  const dir = mkdtempSync(join(tmpdir(), "datum-join-seed-"));
  const g = (args: string[]) => execFileSync("git", ["-C", dir, ...args], { stdio: "ignore" });
  g(["init", "-q"]);
  g(["config", "user.name", opts.name ?? "Test User"]);
  g(["config", "user.email", opts.email ?? "test@acme.dev"]);
  if (opts.branch) g(["symbolic-ref", "HEAD", `refs/heads/${opts.branch}`]);
  if (opts.remote) g(["remote", "add", "origin", opts.remote]);
  return dir;
}

/** Run datum-join.ts against `cwd` with a SessionStart envelope; resolve on exit. */
function runJoin(
  cwd: string,
  env: NodeJS.ProcessEnv,
): Promise<{ status: number | null; stdout: string; stderr: string }> {
  return new Promise((resolveRun) => {
    const child = spawn(process.execPath, [HOOK], { env });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d.toString()));
    child.stderr.on("data", (d) => (stderr += d.toString()));
    child.on("close", (code) => resolveRun({ status: code, stdout, stderr }));
    child.on("error", () => resolveRun({ status: 1, stdout, stderr }));
    // SessionStart envelope: cwd points the hook (and the lib helpers) at the repo.
    child.stdin.write(JSON.stringify({ session_id: "s-fresh", cwd, source: "startup" }));
    child.stdin.end();
  });
}

function readState(dir: string): any {
  return JSON.parse(readFileSync(join(dir, ".datum", "state.json"), "utf8"));
}

/** A clean env that cannot reach a bus and pins cwd via the envelope only. */
function baseEnv(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env };
  delete env.DATUM_BUS_URL;
  delete env.CLAUDE_PROJECT_DIR;
  return { ...env, ...extra };
}

test("seed: no state.json -> identity from git config, workspace from the remote", async () => {
  const dir = makeRepo({
    remote: "git@github.com:acme/workspaces.git",
    name: "Asha P",
    email: "asha@acme.dev",
    branch: "asha/schema",
  });
  try {
    assert.equal(existsSync(join(dir, ".datum", "state.json")), false, "starts with no state");
    const res = await runJoin(dir, baseEnv());
    assert.equal(res.status, 0, "hook fails open (exit 0) with no bus");

    const state = readState(dir);
    assert.equal(state.human, "Asha P", "human <- git config user.name");
    assert.equal(state.email, "asha@acme.dev", "email <- git config user.email");
    assert.equal(state.branch, "asha/schema", "branch <- current branch");
    assert.equal(state.workspace_id, "github.com/acme/workspaces", "workspace_id <- the remote");
    assert.ok(state.session_id, "a session_id was minted");
    assert.deepEqual(state.claim_files, [], "claim_files empty");
    assert.deepEqual(state.claim_symbols, [], "claim_symbols empty");
    assert.equal(state.last_synced_version, 0, "last_synced_version 0");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("seed: bus_url default is localhost when no datum.json and no env", async () => {
  const dir = makeRepo({ remote: "git@github.com:acme/workspaces.git" });
  try {
    await runJoin(dir, baseEnv());
    assert.equal(readState(dir).bus_url, "http://127.0.0.1:4317", "default localhost bus");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("seed: DATUM_BUS_URL env beats the default", async () => {
  const dir = makeRepo({ remote: "git@github.com:acme/workspaces.git" });
  try {
    await runJoin(dir, baseEnv({ DATUM_BUS_URL: "http://from-env:2" }));
    assert.equal(readState(dir).bus_url, "http://from-env:2", "env beats default");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("seed: committed datum.json beats the env (datum.json > env > default)", async () => {
  const dir = makeRepo({ remote: "git@github.com:acme/workspaces.git" });
  try {
    writeFileSync(
      join(dir, "datum.json"),
      JSON.stringify({ workspace: "auto", bus_url: "http://from-config:1" }, null, 2) + "\n",
    );
    await runJoin(dir, baseEnv({ DATUM_BUS_URL: "http://from-env:2" }));
    assert.equal(readState(dir).bus_url, "http://from-config:1", "committed datum.json wins");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("seed: an existing valid state is left untouched (idempotent)", async () => {
  const dir = makeRepo({ remote: "git@github.com:acme/workspaces.git", name: "Asha P", email: "asha@acme.dev" });
  try {
    // a complete, hand-written state with values that differ from the git derivation.
    const original = {
      session_id: "s-existing",
      human: "ben",
      email: "ben@acme.dev",
      branch: "ben/api",
      workspace_id: "github.com/other/team",
      last_synced_version: 7,
      claim_files: ["routes/users.ts"],
      claim_symbols: ["UserDTO"],
      bus_url: "http://existing-bus:9",
    };
    mkdirSync(join(dir, ".datum"), { recursive: true });
    writeFileSync(join(dir, ".datum", "state.json"), JSON.stringify(original, null, 2) + "\n");

    await runJoin(dir, baseEnv({ DATUM_BUS_URL: "http://from-env:2" }));

    const after = readState(dir);
    assert.equal(after.session_id, "s-existing", "session_id preserved");
    assert.equal(after.human, "ben", "human preserved (not re-derived from git)");
    assert.equal(after.workspace_id, "github.com/other/team", "workspace_id preserved");
    assert.equal(after.branch, "ben/api", "branch preserved");
    assert.equal(after.bus_url, "http://existing-bus:9", "bus_url preserved");
    assert.deepEqual(after.claim_files, ["routes/users.ts"], "claim preserved");
    assert.deepEqual(after.claim_symbols, ["UserDTO"], "symbols preserved");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
