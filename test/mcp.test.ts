// test/mcp.test.ts — MCP server tool-contract assertions (schema §4 + PRD).
//
// Run: node --test test/mcp.test.ts
//
// Substrate: startBus on an ephemeral in-memory-ish file db seeded to the
// workspace-invites pre-delta state (epoch 7), then applyEdit asha's migration
// so epoch === 8. DATUM_BUS_URL points the MCP handlers at it. We assert the 4
// handlers behave per the contract, plus a stdio smoke (spawn the server, send
// initialize + tools/list, get a well-formed JSON-RPC result listing 4 tools).

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

import { startBus, type StartBusResult } from "../server/index.ts";
import { Store } from "../server/store.ts";
import { seedScenario, ASHA_MIGRATION_AFTER, ASHA_WHY } from "../server/seed.ts";
import { applyEdit } from "../server/registry.ts";
import { openDb } from "../server/db.ts";

import {
  datum_registry_snapshot,
  datum_deltas_since,
  datum_decide,
  datum_my_advisories,
  datum_claim,
  datum_sync,
  datum_sessions,
  callTool,
  handleRpc,
  TOOLS,
} from "../server/mcp.ts";

let bus: StartBusResult;
let projectDir: string;
let prevBusUrl: string | undefined;
let prevProjectDir: string | undefined;
let dbDir: string;

before(async () => {
  // 1) seed a file db to epoch 7, then apply asha's hero migration -> epoch 8.
  dbDir = mkdtempSync(join(tmpdir(), "datum-mcp-db-"));
  const dbPath = join(dbDir, "datum.db");
  const seedDb = openDb(dbPath);
  const seedStore = new Store(seedDb);
  seedScenario(seedStore);
  // applyEdit asha's migration so epoch === 8 (the workspace-invites delta).
  const res = applyEdit(seedStore, {
    session_id: "sess-asha",
    human: "asha",
    tool_name: "Write",
    path: "migrations/0042_rename.sql",
    after: ASHA_MIGRATION_AFTER,
    why: ASHA_WHY,
  });
  assert.equal(res.registry_version, 8, "applyEdit should bump epoch 7 -> 8");
  seedDb.close();

  // 2) start the bus on the seeded db (tower-stopped fine: handlers proxy bus).
  bus = await startBus({ port: 0, dbPath });

  // 3) point the MCP handlers at the bus + a workspace whose state.json names
  //    a seeded session (ben) so datum_decide author + datum_my_advisories id
  //    resolve from .datum/state.json (schema §8).
  prevBusUrl = process.env.DATUM_BUS_URL;
  prevProjectDir = process.env.CLAUDE_PROJECT_DIR;
  process.env.DATUM_BUS_URL = bus.url;

  projectDir = mkdtempSync(join(tmpdir(), "datum-mcp-ws-"));
  mkdirSync(join(projectDir, ".datum"), { recursive: true });
  writeFileSync(
    join(projectDir, ".datum", "state.json"),
    JSON.stringify({
      session_id: "sess-ben",
      human: "ben",
      branch: "ben/api",
      last_synced_version: 7,
      bus_url: bus.url,
    }),
  );
  process.env.CLAUDE_PROJECT_DIR = projectDir;
});

after(async () => {
  if (bus) await bus.close();
  if (prevBusUrl === undefined) delete process.env.DATUM_BUS_URL;
  else process.env.DATUM_BUS_URL = prevBusUrl;
  if (prevProjectDir === undefined) delete process.env.CLAUDE_PROJECT_DIR;
  else process.env.CLAUDE_PROJECT_DIR = prevProjectDir;
  try {
    rmSync(projectDir, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
  try {
    rmSync(dbDir, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
});

test("datum_registry_snapshot -> registry_version 8 with db.users at current_version 8", async () => {
  const snap = (await datum_registry_snapshot()) as {
    registry_version: number;
    contracts: Array<{ id: string; current_version: number; current_value: string }>;
  };
  assert.ok(!("warning" in snap), "should reach the bus");
  assert.equal(snap.registry_version, 8);
  const users = snap.contracts.find((c) => c.id === "db.users");
  assert.ok(users, "db.users contract present");
  assert.equal(users!.current_version, 8);
  // sanity: the rename landed (contact_email now present in the snapshot value).
  assert.match(users!.current_value, /contact_email/);
});

test("datum_deltas_since(7) -> exactly the one rename_column delta (email->contact_email, asha)", async () => {
  const out = (await datum_deltas_since(7)) as {
    deltas: Array<{
      epoch: number;
      contract_id: string;
      author: string;
      mechanical_change: { kind: string; from?: string; to?: string };
    }>;
  };
  assert.ok(!("warning" in out), "should reach the bus");
  assert.equal(out.deltas.length, 1, "exactly one delta since v7");
  const d = out.deltas[0];
  assert.equal(d.epoch, 8);
  assert.equal(d.contract_id, "db.users");
  assert.equal(d.author, "asha");
  assert.equal(d.mechanical_change.kind, "rename_column");
  assert.equal(d.mechanical_change.from, "email");
  assert.equal(d.mechanical_change.to, "contact_email");
});

test("datum_deltas_since(8) -> [] (caller already at current epoch)", async () => {
  const out = (await datum_deltas_since(8)) as { deltas: unknown[] };
  assert.ok(!("warning" in out), "should reach the bus");
  assert.deepEqual(out.deltas, []);
});

test("datum_decide('note') -> numeric ledger_id, UNCHANGED registry_version (epoch-neutral)", async () => {
  const before = (await datum_registry_snapshot()) as { registry_version: number };
  const out = (await datum_decide("note")) as { ledger_id: number; registry_version: number };
  assert.ok(!("warning" in out), "should reach the bus");
  assert.equal(typeof out.ledger_id, "number");
  assert.ok(out.ledger_id >= 112, "first live ledger id is 112+");
  // epoch-neutral: registry_version unchanged by a free-form decision.
  assert.equal(out.registry_version, before.registry_version);
  assert.equal(out.registry_version, 8);
});

test("datum_my_advisories -> resolves against the session id (no advisories seeded => [])", async () => {
  const out = (await datum_my_advisories()) as { advisories: unknown[] };
  assert.ok(!("warning" in out), "should reach the bus");
  assert.ok(Array.isArray(out.advisories));
});

test("datum_sessions -> the live roster including the three seeded sessions", async () => {
  const out = (await datum_sessions()) as {
    sessions: Array<{ id: string; human: string; branch: string; claim_files: string[] }>;
  };
  assert.ok(!("warning" in out), "should reach the bus");
  assert.ok(Array.isArray(out.sessions));
  const ben = out.sessions.find((s) => s.id === "sess-ben");
  assert.ok(ben, "ben is on the roster");
  assert.equal(ben!.human, "ben");
  assert.equal(ben!.branch, "ben/api");
  assert.deepEqual(ben!.claim_files, ["routes/users.ts"]);
});

test("datum_sync -> registry_version 8 + advisories + the one delta since v7 (from state)", async () => {
  const out = (await datum_sync()) as {
    registry_version: number;
    advisories: unknown[];
    deltas: Array<{ contract_id: string; mechanical_change: { kind: string } }>;
  };
  assert.ok(!("warning" in out), "should reach the bus");
  assert.equal(out.registry_version, 8);
  assert.ok(Array.isArray(out.advisories));
  // last_synced_version in state is 7, so the hero rename delta is returned.
  assert.equal(out.deltas.length, 1);
  assert.equal(out.deltas[0].contract_id, "db.users");
  assert.equal(out.deltas[0].mechanical_change.kind, "rename_column");
});

test("datum_claim (replace) -> sets the claim and echoes it back", async () => {
  const out = (await datum_claim(["routes/invites.ts"], ["createInvite"])) as {
    claim_files: string[];
    claim_symbols: string[];
  };
  assert.ok(!("warning" in out), "should reach the bus");
  assert.deepEqual(out.claim_files, ["routes/invites.ts"]);
  assert.deepEqual(out.claim_symbols, ["createInvite"]);
  // the PATCH landed on the bus: ben's roster claim now reflects the replacement.
  const roster = (await datum_sessions()) as {
    sessions: Array<{ id: string; claim_files: string[]; claim_symbols: string[] }>;
  };
  const ben = roster.sessions.find((s) => s.id === "sess-ben")!;
  assert.deepEqual(ben.claim_files, ["routes/invites.ts"]);
  assert.deepEqual(ben.claim_symbols, ["createInvite"]);
});

test("datum_claim (add) -> merges with the session's current claim from state, deduped", async () => {
  // state seeds claim_files/claim_symbols, so add merges onto those.
  const out = (await datum_claim(["routes/users.ts"], ["user.email"], true)) as {
    claim_files: string[];
    claim_symbols: string[];
  };
  assert.ok(!("warning" in out), "should reach the bus");
  // state.json for this workspace has no claim arrays, so add merges onto [].
  assert.deepEqual(out.claim_files, ["routes/users.ts"]);
  assert.deepEqual(out.claim_symbols, ["user.email"]);
});

test("datum_claim via callTool dispatch -> coerces args and reaches the bus", async () => {
  const out = (await callTool("datum_claim", {
    files: ["UserCard.tsx"],
    symbols: ["UserDTO.email"],
    add: false,
  })) as { claim_files: string[]; claim_symbols: string[] };
  assert.ok(!("warning" in out), "should reach the bus");
  assert.deepEqual(out.claim_files, ["UserCard.tsx"]);
  assert.deepEqual(out.claim_symbols, ["UserDTO.email"]);
});

test("fail open: bus unreachable -> structured warning, no crash", async () => {
  const saved = process.env.DATUM_BUS_URL;
  // an unused localhost port (nothing listening) -> fetch rejects -> warning.
  process.env.DATUM_BUS_URL = "http://127.0.0.1:1";
  // also clear the state file's bus_url precedence by reading fresh: the handler
  // reads state which carries bus_url; point both at the dead address.
  const prevState = process.env.CLAUDE_PROJECT_DIR;
  const deadWs = mkdtempSync(join(tmpdir(), "datum-mcp-dead-"));
  mkdirSync(join(deadWs, ".datum"), { recursive: true });
  writeFileSync(
    join(deadWs, ".datum", "state.json"),
    JSON.stringify({ session_id: "sess-ben", human: "ben", bus_url: "http://127.0.0.1:1" }),
  );
  process.env.CLAUDE_PROJECT_DIR = deadWs;
  try {
    const snap = (await datum_registry_snapshot()) as { warning?: string };
    assert.ok(snap.warning, "unreachable bus returns a structured warning");
    assert.match(snap.warning!, /unreachable|returned/);
  } finally {
    process.env.DATUM_BUS_URL = saved;
    process.env.CLAUDE_PROJECT_DIR = prevState;
    rmSync(deadWs, { recursive: true, force: true });
  }
});

test("handleRpc: initialize + tools/list shape", async () => {
  const init = await handleRpc({ jsonrpc: "2.0", id: 1, method: "initialize" });
  assert.ok(init);
  assert.equal(init!.id, 1);
  const r = init!.result as { protocolVersion: string; capabilities: { tools: object }; serverInfo: { name: string } };
  assert.ok(r.protocolVersion);
  assert.ok(r.capabilities.tools);
  assert.equal(r.serverInfo.name, "datum");

  const list = await handleRpc({ jsonrpc: "2.0", id: 2, method: "tools/list" });
  const tools = (list!.result as { tools: Array<{ name: string }> }).tools;
  assert.equal(tools.length, 7);
  assert.equal(TOOLS.length, 7);
});

test("stdio smoke: spawn node server/mcp.ts, initialize + tools/list over JSON-RPC", async () => {
  const mcpPath = fileURLToPath(new URL("../server/mcp.ts", import.meta.url));
  const child = spawn(process.execPath, [mcpPath], {
    stdio: ["pipe", "pipe", "inherit"],
    env: { ...process.env, DATUM_BUS_URL: bus.url, CLAUDE_PROJECT_DIR: projectDir },
  });

  const responses: any[] = [];
  let buf = "";
  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk: string) => {
    buf += chunk;
    let idx: number;
    while ((idx = buf.indexOf("\n")) !== -1) {
      const line = buf.slice(0, idx).trim();
      buf = buf.slice(idx + 1);
      if (line) {
        try {
          responses.push(JSON.parse(line));
        } catch {
          /* ignore */
        }
      }
    }
  });

  child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize" }) + "\n");
  child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list" }) + "\n");

  // wait until we have both responses (or time out).
  const deadline = Date.now() + 5000;
  while (responses.length < 2 && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 25));
  }

  child.stdin.end();
  child.kill();

  const initResp = responses.find((r) => r.id === 1);
  const listResp = responses.find((r) => r.id === 2);

  assert.ok(initResp, "got an initialize response");
  assert.equal(initResp.jsonrpc, "2.0");
  assert.ok(initResp.result.protocolVersion, "initialize result has protocolVersion");
  assert.ok(initResp.result.capabilities.tools, "advertises tools capability");

  assert.ok(listResp, "got a tools/list response");
  assert.equal(listResp.jsonrpc, "2.0");
  const names = (listResp.result.tools as Array<{ name: string }>).map((t) => t.name).sort();
  assert.deepEqual(names, [
    "datum_claim",
    "datum_decide",
    "datum_deltas_since",
    "datum_my_advisories",
    "datum_registry_snapshot",
    "datum_sessions",
    "datum_sync",
  ]);
});
