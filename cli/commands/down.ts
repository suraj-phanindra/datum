// cli/commands/down.ts — datum down. Stop the background bus started by `datum up`
// (SIGTERM the pid in .datum/bus.pid). No-op if nothing is recorded.

import type { Command, Ctx } from "./types.ts";
import { stopBus } from "../lib/bus-daemon.ts";
import { out, emitJson, ambient, synced, mark } from "../lib/format.ts";

export const downCommand: Command = {
  name: "down",
  summary: "stop the background local bus started by `datum up`",
  usage: "datum down [--json]",
  group: "ops",
  async run(ctx: Ctx) {
    const res = stopBus(ctx.projectDir);
    if (ctx.json) {
      emitJson(res);
      return 0;
    }
    if (res.stopped) out(`${mark()} ${synced("stopped")} bus ${ambient(`(pid ${res.pid})`)}`);
    else out(`${mark()} ${ambient("no background bus to stop (no .datum/bus.pid)")}`);
    return 0;
  },
};
