// cli/lib/bus-daemon.ts — start/stop the LOCAL bus as a detached background
// process. `datum serve` blocks a terminal; this is what lets an agent (or the
// setup skill) bring the bus up and walk away. It reuses `serve` verbatim: it
// spawns THIS cli with the `serve` subcommand, detached, logging to .datum/bus.log
// and recording the pid in .datum/bus.pid.
//
// ponytail: one local bus per bus_url port (default 4317). Two repos on the same
// default port share one bus/db — fine for the common single-repo case; give each
// repo a distinct bus_url port if you need isolated buses.

import { spawn } from "node:child_process";
import { openSync, existsSync, readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";

export function busPidPath(dir: string): string {
  return join(dir, ".datum", "bus.pid");
}
export function busLogPath(dir: string): string {
  return join(dir, ".datum", "bus.log");
}

/** Only a loopback bus_url is ours to start; a remote/cloud bus we never touch. */
export function isLocalBus(busUrl: string): boolean {
  try {
    const h = new URL(busUrl).hostname;
    return h === "127.0.0.1" || h === "localhost" || h === "::1";
  } catch {
    return false;
  }
}

/** GET {busUrl}/healthz under a short timeout; true iff it answers ok. */
export async function busReachable(busUrl: string, timeoutMs = 600): Promise<boolean> {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(`${busUrl}/healthz`, { signal: ac.signal });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(t);
  }
}

export type EnsureResult = {
  status: "reachable" | "started" | "remote" | "failed";
  url: string;
};

/**
 * Ensure the local bus at `busUrl` is running, starting it detached if not.
 * Idempotent: a reachable bus is a no-op; a remote bus is left alone. Returns once
 * the bus answers /healthz or the timeout elapses.
 */
export async function ensureBusUp(
  dir: string,
  busUrl: string,
  opts: { timeoutMs?: number } = {},
): Promise<EnsureResult> {
  if (!isLocalBus(busUrl)) return { status: "remote", url: busUrl };

  // Bind the SAME host:port we probe, so a loopback bus_url like http://[::1]:4317
  // or a portless one can't bind 127.0.0.1:4317 while we poll a different address.
  let u: URL;
  try {
    u = new URL(busUrl);
  } catch {
    return { status: "failed", url: busUrl };
  }
  const host = u.hostname;
  const port = u.port || "4317";
  const origin = host.includes(":") ? `${u.protocol}//[${host}]:${port}` : `${u.protocol}//${host}:${port}`;

  if (await busReachable(origin)) return { status: "reachable", url: origin };

  let child;
  try {
    mkdirSync(join(dir, ".datum"), { recursive: true });
    const log = openSync(busLogPath(dir), "a");
    const cliEntry = process.argv[1]; // this datum CLI; spawning it with `serve` reuses serve verbatim.
    child = spawn(process.execPath, [cliEntry, "serve", "--host", host, "--port", port], {
      cwd: dir,
      detached: true,
      stdio: ["ignore", log, log],
      env: { ...process.env, DATUM_BUS_URL: busUrl },
    });
    child.unref();
  } catch {
    return { status: "failed", url: origin };
  }

  // Record the pid only once the bus is reachable AND our child is still the one
  // running it. ponytail: under two concurrent `datum up` in one repo, the loser
  // hits EADDRINUSE and exits within a tick of binding; the exitCode guard keeps
  // that dead pid from clobbering the winner's pidfile (which `datum down` needs).
  const deadline = Date.now() + (opts.timeoutMs ?? 4000);
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 120));
    if (await busReachable(origin)) {
      const oursAlive = child.exitCode === null && child.pid != null;
      if (oursAlive) writeFileSync(busPidPath(dir), String(child.pid) + "\n", "utf8");
      return { status: oursAlive ? "started" : "reachable", url: origin };
    }
    if (child.exitCode !== null) return { status: "failed", url: origin }; // our serve died (e.g. port in use)
  }
  return { status: "failed", url: origin };
}

export type StopResult = { stopped: boolean; pid?: number };

/** Stop the background bus recorded in .datum/bus.pid (SIGTERM), remove the pidfile. */
export function stopBus(dir: string): StopResult {
  const p = busPidPath(dir);
  if (!existsSync(p)) return { stopped: false };
  const pid = Number(readFileSync(p, "utf8").trim());
  rmSync(p, { force: true });
  if (!Number.isInteger(pid) || pid <= 0) return { stopped: false };
  try {
    process.kill(pid, "SIGTERM");
    return { stopped: true, pid };
  } catch {
    return { stopped: false, pid }; // already gone
  }
}
