// cli/commands/up.ts — datum up. Start the local bus in the BACKGROUND (detached)
// and wait until it is healthy. This is the "agent owns the bus" entrypoint:
// `datum serve` blocks a terminal, `datum up` returns once the bus is live so an
// agent can start it and keep working. Idempotent; `datum down` stops it.

import type { Command, Ctx } from "./types.ts";
import { ensureBusUp } from "../lib/bus-daemon.ts";
import { out, emitJson, ambient, synced, warn, mark, ident } from "../lib/format.ts";

export const upCommand: Command = {
  name: "up",
  summary: "start the local bus in the background and wait until it is healthy",
  usage: "datum up [--json]",
  group: "ops",
  help:
    "Idempotent. If your bus_url is already up, does nothing. If it is a remote/cloud\n" +
    "bus, there is nothing to start locally. Logs to .datum/bus.log, pid in\n" +
    ".datum/bus.pid. Stop it with `datum down`.",
  async run(ctx: Ctx) {
    const res = await ensureBusUp(ctx.projectDir, ctx.busUrl);
    if (ctx.json) {
      emitJson(res);
      return res.status === "failed" ? 1 : 0;
    }
    switch (res.status) {
      case "reachable":
        out(`${mark()} ${synced("bus")} already up at ${ident(res.url)}`);
        return 0;
      case "started":
        out(`${mark()} ${synced("bus")} started at ${ident(res.url)} ${ambient("(background · datum down to stop)")}`);
        return 0;
      case "remote":
        out(`${mark()} ${ambient("remote bus")} ${ident(res.url)} ${ambient("· nothing to start locally")}`);
        return 0;
      case "failed":
        warn(`up: bus did not come up at ${res.url} — see .datum/bus.log`);
        return 1;
    }
  },
};
