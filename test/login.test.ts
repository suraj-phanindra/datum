// test/login.test.ts — datum login + cloud-mode bearer auth (TASK E).
//
// 1. `datum login --bus <url> --token <t>` writes bus_url + token into LOCAL
//    state (.datum/state.json) in a temp dir.
// 2. the token does NOT land in the committed datum.json.
// 3. a BusClient built from that state sends "Authorization: Bearer <t>" on
//    every bus request (and self-hosted state — no token — sends none).

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer, type Server } from "node:http";

import { run } from "../cli/datum.ts";
import { readState, statePath } from "../cli/lib/state.ts";
import { configPath, writeConfig } from "../cli/lib/config.ts";
import { BusClient } from "../cli/lib/client.ts";
import { disableColor } from "../cli/lib/format.ts";

const TOKEN = "tok_live_abcdef0123456789";

function tmpProj(): string {
  return mkdtempSync(join(tmpdir(), "datum-login-"));
}

// A tiny HTTP server that records the Authorization header of the last request.
function authRecorder(): Promise<{ url: string; lastAuth(): string | undefined; close(): Promise<void> }> {
  return new Promise((resolve) => {
    let lastAuth: string | undefined;
    const server: Server = createServer((req, res) => {
      lastAuth = req.headers["authorization"] as string | undefined;
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ registry_version: 7 }));
    });
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      resolve({
        url: `http://127.0.0.1:${port}`,
        lastAuth: () => lastAuth,
        close: () => new Promise<void>((r) => server.close(() => r())),
      });
    });
  });
}

// ---- 1 + 2. login persists bus_url + token to LOCAL state, not datum.json -----

test("login --bus --token writes bus_url + token to local state (temp dir)", async () => {
  const dir = tmpProj();
  const prevDir = process.env.CLAUDE_PROJECT_DIR;
  const prevTok = process.env.DATUM_TOKEN;
  const prevBus = process.env.DATUM_BUS_URL;
  try {
    process.env.CLAUDE_PROJECT_DIR = dir;
    delete process.env.DATUM_TOKEN;
    delete process.env.DATUM_BUS_URL;
    disableColor();

    const code = await run(["login", "--bus", "https://bus.datum.dev", "--token", TOKEN]);
    assert.equal(code, 0, "login exits 0");

    const state = readState(dir);
    assert.ok(state, "local state.json was written");
    assert.equal(state!.bus_url, "https://bus.datum.dev", "bus_url persisted to local state");
    assert.equal(state!.token, TOKEN, "token persisted to local state");
    assert.ok(existsSync(statePath(dir)), "state file lives under .datum/");
  } finally {
    if (prevDir != null) process.env.CLAUDE_PROJECT_DIR = prevDir;
    else delete process.env.CLAUDE_PROJECT_DIR;
    if (prevTok != null) process.env.DATUM_TOKEN = prevTok;
    if (prevBus != null) process.env.DATUM_BUS_URL = prevBus;
    rmSync(dir, { recursive: true, force: true });
  }
});

test("login does NOT write the token into the committed datum.json", async () => {
  const dir = tmpProj();
  const prevDir = process.env.CLAUDE_PROJECT_DIR;
  const prevTok = process.env.DATUM_TOKEN;
  try {
    process.env.CLAUDE_PROJECT_DIR = dir;
    delete process.env.DATUM_TOKEN;
    disableColor();

    // a committed team config already exists at the repo root.
    writeConfig(dir, { workspace: "auto", bus_url: "https://bus.datum.dev" });

    await run(["login", "--bus", "https://bus.datum.dev", "--token", TOKEN]);

    const raw = readFileSync(configPath(dir), "utf8");
    assert.ok(!raw.includes(TOKEN), "the token never lands in datum.json");
    const cfg = JSON.parse(raw);
    assert.equal(cfg.token, undefined, "datum.json has no token field");
  } finally {
    if (prevDir != null) process.env.CLAUDE_PROJECT_DIR = prevDir;
    else delete process.env.CLAUDE_PROJECT_DIR;
    if (prevTok != null) process.env.DATUM_TOKEN = prevTok;
    rmSync(dir, { recursive: true, force: true });
  }
});

// ---- 3. a client built from that state sends the bearer header ---------------

test("a BusClient built from logged-in state sends Authorization: Bearer", async () => {
  const dir = tmpProj();
  const prevDir = process.env.CLAUDE_PROJECT_DIR;
  const prevTok = process.env.DATUM_TOKEN;
  const rec = await authRecorder();
  try {
    process.env.CLAUDE_PROJECT_DIR = dir;
    delete process.env.DATUM_TOKEN;

    // log in against the recorder bus.
    await run(["login", "--bus", rec.url, "--token", TOKEN]);

    // build a client exactly as the router/hooks would, from local state.
    const state = readState(dir)!;
    const cloud = new BusClient(state.bus_url, { token: state.token });
    const res = await cloud.version();
    assert.equal(res.ok, true, "request succeeded");
    assert.equal(rec.lastAuth(), `Bearer ${TOKEN}`, "cloud client sends the bearer token");

    // self-hosted (no token) sends no Authorization header.
    const selfHosted = new BusClient(rec.url);
    await selfHosted.version();
    assert.equal(rec.lastAuth(), undefined, "self-hosted client sends no Authorization header");
  } finally {
    await rec.close();
    if (prevDir != null) process.env.CLAUDE_PROJECT_DIR = prevDir;
    else delete process.env.CLAUDE_PROJECT_DIR;
    if (prevTok != null) process.env.DATUM_TOKEN = prevTok;
    rmSync(dir, { recursive: true, force: true });
  }
});
