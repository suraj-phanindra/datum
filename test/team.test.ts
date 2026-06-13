// test/team.test.ts — the self-hosted, git-native team layer (schema §10).
//
// Groups:
//   1. git derivation: deriveWorkspaceId from a fake origin remote; git-native
//      init (NO --human) derives human/email/branch from git config + workspace_id
//      from the remote; TWO repos with the SAME remote derive the SAME id.
//   2. datum.json: created on the first init, READ on a second init (shared
//      bus_url); the precedence datum.json < env < flag.
//   3. bus: POST /sessions stores workspace_id + email; GET /sessions returns
//      them; a mismatched workspace_id triggers a warning (fail-open).
//   4. `datumctl team` renders the live roster.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

import {
  deriveWorkspaceId,
  normalizeRemote,
  gitUserName,
  gitUserEmail,
  currentBranch,
} from "../cli/lib/git.ts";
import { init } from "../cli/init.ts";
import { readConfig } from "../cli/lib/config.ts";
import { startBus } from "../server/index.ts";
import { run } from "../cli/datum.ts";
import { captureOutput, disableColor } from "../cli/lib/format.ts";
import type { DatumState } from "../cli/lib/state.ts";
import { writeFileSync, mkdirSync } from "node:fs";

// ---- helpers ----

/** Make a tmp git repo with a name/email/branch + (optional) origin remote. */
function makeRepo(opts: { remote?: string; name?: string; email?: string; branch?: string }): string {
  const dir = mkdtempSync(join(tmpdir(), "datum-team-"));
  const g = (args: string[]) => execFileSync("git", ["-C", dir, ...args], { stdio: "ignore" });
  g(["init", "-q"]);
  g(["config", "user.name", opts.name ?? "Test User"]);
  g(["config", "user.email", opts.email ?? "test@acme.dev"]);
  if (opts.branch) g(["symbolic-ref", "HEAD", `refs/heads/${opts.branch}`]);
  if (opts.remote) g(["remote", "add", "origin", opts.remote]);
  return dir;
}

function readJson(path: string): any {
  return JSON.parse(readFileSync(path, "utf8"));
}

// ---- 1. git derivation -------------------------------------------------------

test("git: normalizeRemote reduces protocol/.git/trailing-slash to host/owner/repo", () => {
  assert.equal(normalizeRemote("https://github.com/acme/workspaces.git"), "github.com/acme/workspaces");
  assert.equal(normalizeRemote("git@github.com:acme/workspaces.git"), "github.com/acme/workspaces");
  assert.equal(normalizeRemote("https://github.com/acme/workspaces/"), "github.com/acme/workspaces");
});

test("git: deriveWorkspaceId from a fake origin remote -> github.com/acme/workspaces", () => {
  const dir = makeRepo({ remote: "git@github.com:acme/workspaces.git" });
  try {
    assert.equal(deriveWorkspaceId(dir), "github.com/acme/workspaces");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("git: no remote -> local/<repo-dir-basename>", () => {
  const dir = makeRepo({}); // no origin remote
  try {
    const ws = deriveWorkspaceId(dir);
    assert.match(ws, /^local\//, "falls back to local/<basename>");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("git: identity derivation reads git config + branch", () => {
  const dir = makeRepo({ name: "Asha P", email: "asha@acme.dev", branch: "asha/schema" });
  try {
    assert.equal(gitUserName(dir), "Asha P");
    assert.equal(gitUserEmail(dir), "asha@acme.dev");
    assert.equal(currentBranch(dir), "asha/schema");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("init: git-native with NO --human derives human/email/branch + workspace_id from the remote", () => {
  const dir = makeRepo({
    remote: "https://github.com/acme/workspaces.git",
    name: "Asha P",
    email: "asha@acme.dev",
    branch: "asha/schema",
  });
  try {
    // NO --human / --branch / --workspace: pure git derivation.
    const result = init({ projectDir: dir });
    const state: DatumState = readJson(result.statePath);
    assert.equal(state.human, "Asha P", "human <- git config user.name");
    assert.equal(state.email, "asha@acme.dev", "email <- git config user.email");
    assert.equal(state.branch, "asha/schema", "branch <- current branch");
    assert.equal(state.workspace_id, "github.com/acme/workspaces", "workspace_id <- the remote");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("init: flags override the git derivation (--human / --branch / --workspace)", () => {
  const dir = makeRepo({
    remote: "https://github.com/acme/workspaces.git",
    name: "Asha P",
    branch: "asha/schema",
  });
  try {
    const result = init({ projectDir: dir, human: "ben", branch: "ben/api", workspaceId: "explicit/team" });
    const state: DatumState = readJson(result.statePath);
    assert.equal(state.human, "ben");
    assert.equal(state.branch, "ben/api");
    assert.equal(state.workspace_id, "explicit/team");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("init: TWO separate repos with the SAME remote derive the SAME workspace_id", () => {
  const a = makeRepo({ remote: "git@github.com:acme/workspaces.git", name: "asha" });
  const b = makeRepo({ remote: "https://github.com/acme/workspaces.git", name: "ben" });
  try {
    const sa: DatumState = readJson(init({ projectDir: a }).statePath);
    const sb: DatumState = readJson(init({ projectDir: b }).statePath);
    assert.equal(sa.workspace_id, "github.com/acme/workspaces");
    assert.equal(sb.workspace_id, "github.com/acme/workspaces");
    assert.equal(sa.workspace_id, sb.workspace_id, "same remote -> same team key");
  } finally {
    rmSync(a, { recursive: true, force: true });
    rmSync(b, { recursive: true, force: true });
  }
});

// ---- 2. datum.json -----------------------------------------------------------

test("datum.json: CREATED on first init, READ on a second init (shared bus_url)", () => {
  const dir = makeRepo({ remote: "git@github.com:acme/workspaces.git", name: "asha" });
  try {
    // first init (you set up the team) creates datum.json with the chosen bus_url.
    const first = init({ projectDir: dir, busUrl: "http://bus.acme.internal:4317" });
    assert.equal(first.configCreated, true, "first init creates datum.json");
    assert.ok(existsSync(first.configPath), "datum.json exists at repo root");
    const cfg = readConfig(dir);
    assert.equal(cfg?.workspace, "auto", "workspace defaults to auto");
    assert.equal(cfg?.bus_url, "http://bus.acme.internal:4317");

    // second init (a teammate) READS the shared datum.json — no bus flag, no env.
    const prevEnv = process.env.DATUM_BUS_URL;
    delete process.env.DATUM_BUS_URL;
    try {
      const second = init({ projectDir: dir, human: "ben" });
      assert.equal(second.configCreated, false, "second init reads the existing datum.json");
      assert.equal(
        second.state.bus_url,
        "http://bus.acme.internal:4317",
        "teammate inherits the shared bus_url from datum.json",
      );
    } finally {
      if (prevEnv != null) process.env.DATUM_BUS_URL = prevEnv;
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("datum.json: merge precedence datum.json < env < flag for bus_url", () => {
  const dir = makeRepo({ remote: "git@github.com:acme/workspaces.git" });
  const prevEnv = process.env.DATUM_BUS_URL;
  try {
    // seed datum.json with a base bus_url.
    init({ projectDir: dir, busUrl: "http://from-config:1" });

    // env beats datum.json.
    process.env.DATUM_BUS_URL = "http://from-env:2";
    const envWins = init({ projectDir: dir });
    assert.equal(envWins.state.bus_url, "http://from-env:2", "env beats datum.json");

    // explicit flag beats env.
    const flagWins = init({ projectDir: dir, busUrl: "http://from-flag:3" });
    assert.equal(flagWins.state.bus_url, "http://from-flag:3", "flag beats env");
  } finally {
    if (prevEnv != null) process.env.DATUM_BUS_URL = prevEnv;
    else delete process.env.DATUM_BUS_URL;
    rmSync(dir, { recursive: true, force: true });
  }
});

// ---- 3. bus stores workspace_id + warns on mismatch --------------------------

async function jpost(url: string, body: unknown): Promise<any> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}

test("bus: POST /sessions stores workspace_id + email; GET /sessions returns them", async () => {
  const bus = await startBus({ port: 0, dbPath: ":memory:" });
  try {
    const joined = await jpost(`${bus.url}/sessions`, {
      session_id: "s-asha",
      human: "asha",
      email: "asha@acme.dev",
      branch: "asha/schema",
      workspace_id: "github.com/acme/workspaces",
      claim_files: ["migrations/**"],
      claim_symbols: ["users.email"],
    });
    // the bus adopts the first workspace it sees + echoes it; no warning.
    assert.equal(joined.workspace_id, "github.com/acme/workspaces");
    assert.equal(joined.warning, undefined, "first join is not a mismatch");

    const list = await (await fetch(`${bus.url}/sessions`)).json();
    const asha = list.sessions.find((s: any) => s.id === "s-asha");
    assert.ok(asha, "session present in roster");
    assert.equal(asha.workspace_id, "github.com/acme/workspaces", "workspace_id persisted");
    assert.equal(asha.email, "asha@acme.dev", "email persisted");
  } finally {
    await bus.close();
  }
});

test("bus: a session joining with a DIFFERENT workspace_id triggers a warning (fail-open)", async () => {
  const bus = await startBus({ port: 0, dbPath: ":memory:" });
  try {
    // asha establishes the bus's workspace.
    await jpost(`${bus.url}/sessions`, {
      session_id: "s-asha",
      human: "asha",
      workspace_id: "github.com/acme/workspaces",
    });
    // ben joins from a DIFFERENT repo/workspace -> warning, but still 200 + joined.
    const ben = await jpost(`${bus.url}/sessions`, {
      session_id: "s-ben",
      human: "ben",
      workspace_id: "github.com/other/repo",
    });
    assert.ok(ben.warning, "a mismatch returns a warning");
    assert.match(ben.warning, /github\.com\/acme\/workspaces/, "warning names the served workspace");
    assert.match(ben.warning, /github\.com\/other\/repo/, "warning names the joiner's workspace");
    // fail-open: the join still succeeded and ben is in the roster.
    assert.equal(ben.workspace_id, "github.com/acme/workspaces", "bus keeps serving the first workspace");
    const list = await (await fetch(`${bus.url}/sessions`)).json();
    assert.ok(list.sessions.find((s: any) => s.id === "s-ben"), "ben joined despite the mismatch");
  } finally {
    await bus.close();
  }
});

// ---- 4. datumctl team renders the roster -------------------------------------

test("datumctl team renders workspace_id + bus_url + the live roster", async () => {
  const bus = await startBus({ port: 0, dbPath: ":memory:" });
  // seed two members on the bus.
  await jpost(`${bus.url}/sessions`, {
    session_id: "s-asha",
    human: "asha",
    email: "asha@acme.dev",
    branch: "asha/schema",
    workspace_id: "github.com/acme/workspaces",
    claim_files: ["migrations/**"],
    claim_symbols: ["users.email"],
  });
  await jpost(`${bus.url}/sessions`, {
    session_id: "s-ben",
    human: "ben",
    email: "ben@acme.dev",
    branch: "ben/api",
    workspace_id: "github.com/acme/workspaces",
    claim_files: ["routes/users.ts"],
  });

  const projectDir = mkdtempSync(join(tmpdir(), "datum-team-proj-"));
  const prevDir = process.env.CLAUDE_PROJECT_DIR;
  const prevBus = process.env.DATUM_BUS_URL;
  try {
    // local state names the workspace (as `datum init` would have written it).
    mkdirSync(join(projectDir, ".datum"), { recursive: true });
    writeFileSync(
      join(projectDir, ".datum", "state.json"),
      JSON.stringify(
        {
          session_id: "s-asha",
          human: "asha",
          email: "asha@acme.dev",
          branch: "asha/schema",
          workspace_id: "github.com/acme/workspaces",
          last_synced_version: 0,
          claim_files: ["migrations/**"],
          claim_symbols: ["users.email"],
          bus_url: bus.url,
        },
        null,
        2,
      ),
    );
    process.env.CLAUDE_PROJECT_DIR = projectDir;
    process.env.DATUM_BUS_URL = bus.url;
    disableColor();

    // text roster.
    const cap = await captureOutput(() => run(["team"]));
    assert.equal(cap.result, 0);
    assert.match(cap.stdout, /github\.com\/acme\/workspaces/, "shows workspace_id");
    assert.match(cap.stdout, /roster/, "labels the roster");
    assert.match(cap.stdout, /asha/, "lists asha");
    assert.match(cap.stdout, /ben/, "lists ben");
    assert.match(cap.stdout, /ben\/api/, "shows ben's branch");
    assert.match(cap.stdout, new RegExp(bus.url.replace(/[/.:]/g, "\\$&")), "shows the bus url");

    // --json roster.
    const capJson = await captureOutput(() => run(["team", "--json"]));
    assert.equal(capJson.result, 0);
    const json = JSON.parse(capJson.stdout);
    assert.equal(json.workspace_id, "github.com/acme/workspaces");
    assert.equal(json.bus_url, bus.url);
    assert.equal(json.members.length, 2);
    const benM = json.members.find((m: any) => m.human === "ben");
    assert.equal(benM.email, "ben@acme.dev");
    assert.equal(benM.branch, "ben/api");
  } finally {
    await bus.close();
    if (prevDir != null) process.env.CLAUDE_PROJECT_DIR = prevDir;
    else delete process.env.CLAUDE_PROJECT_DIR;
    if (prevBus != null) process.env.DATUM_BUS_URL = prevBus;
    else delete process.env.DATUM_BUS_URL;
    rmSync(projectDir, { recursive: true, force: true });
  }
});
