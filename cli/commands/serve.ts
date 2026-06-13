// cli/commands/serve.ts — datum serve (alias `bus`). Starts the bus + registry +
// arbiter substrate (server/index.ts) and blocks until SIGINT/SIGTERM.

import type { Command } from "./types.ts";
import { startBus } from "../../server/index.ts";
import { out, ambient, synced, warn, mark, ident } from "../lib/format.ts";

function num(v: string | boolean | undefined): number | undefined {
  if (typeof v !== "string") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

export const serveCommand: Command = {
  name: "serve",
  aliases: ["bus"],
  summary: "start the datum bus + registry + arbiter",
  usage: "datum serve [--port N]",
  group: "ops",
  async run(ctx) {
    const port = num(ctx.flags.port);
    try {
      const bus = await startBus(port != null ? { port } : {});
      if (ctx.json) {
        out(JSON.stringify({ url: bus.url, port: bus.port }));
      } else {
        out(`${mark()} ${synced("bus")} listening on ${ident(bus.url)}`);
        out(ambient("ctrl-c to stop · point sessions here with DATUM_BUS_URL"));
      }
      await new Promise<void>((resolve) => {
        const shutdown = () => {
          bus.close().then(resolve);
        };
        process.on("SIGINT", shutdown);
        process.on("SIGTERM", shutdown);
      });
      return 0;
    } catch (err) {
      warn(`serve: could not start bus (${err instanceof Error ? err.message : String(err)})`);
      return 1;
    }
  },
};
