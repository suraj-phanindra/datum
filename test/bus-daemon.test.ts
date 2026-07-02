// test/bus-daemon.test.ts — the detached-bus lifecycle logic. The real detached
// `serve` spawn is verified live (`datum up`); here we cover the branch logic that
// decides whether to spawn, and the pidfile stop path.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { spawn } from "node:child_process";

import { isLocalBus, busReachable, ensureBusUp, stopBus, busPidPath } from "../cli/lib/bus-daemon.ts";
import { startBus } from "../server/index.ts";

const tmp = () => mkdtempSync(join(tmpdir(), "datum-bus-"));

test("isLocalBus: loopback true, remote/cloud false", () => {
  assert.equal(isLocalBus("http://127.0.0.1:4317"), true);
  assert.equal(isLocalBus("http://localhost:4317"), true);
  assert.equal(isLocalBus("https://datum.surajphanindra.workers.dev"), false);
  assert.equal(isLocalBus("not a url"), false);
});

test("ensureBusUp: a remote bus is never started", async () => {
  const res = await ensureBusUp(tmp(), "https://datum.example.workers.dev");
  assert.equal(res.status, "remote");
});

test("ensureBusUp: an already-running local bus is a no-op (reachable, no spawn)", async () => {
  const dir = tmp();
  const bus = await startBus({ port: 0, dbPath: ":memory:" });
  try {
    assert.equal(await busReachable(bus.url), true);
    const res = await ensureBusUp(dir, bus.url);
    assert.equal(res.status, "reachable");
    assert.equal(res.url, bus.url);
    // no pidfile written for a bus we did not start
    assert.equal(existsSync(busPidPath(dir)), false);
  } finally {
    await bus.close();
  }
});

test("stopBus: SIGTERMs the recorded pid and removes the pidfile", async () => {
  const dir = tmp();
  const child = spawn(process.execPath, ["-e", "process.on('SIGTERM',()=>process.exit(0));setInterval(()=>{},1e9)"], {
    detached: true,
    stdio: "ignore",
  });
  child.unref();
  const pid = child.pid!;
  mkdirSync(dirname(busPidPath(dir)), { recursive: true });
  writeFileSync(busPidPath(dir), String(pid) + "\n", "utf8");

  const res = stopBus(dir);
  assert.equal(res.stopped, true);
  assert.equal(res.pid, pid);
  assert.equal(existsSync(busPidPath(dir)), false);

  // the process actually dies (poll for ESRCH)
  const deadline = Date.now() + 1500;
  let alive = true;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 50));
    try {
      process.kill(pid, 0);
    } catch {
      alive = false;
      break;
    }
  }
  assert.equal(alive, false);
});

test("stopBus: no pidfile -> not stopped, no throw", () => {
  assert.deepEqual(stopBus(tmp()), { stopped: false });
});
