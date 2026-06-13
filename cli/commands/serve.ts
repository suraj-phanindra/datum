// cli/commands/serve.ts — datum serve (alias `bus`). Starts the bus + registry +
// arbiter substrate (server/index.ts) and blocks until SIGINT/SIGTERM.
//
// §10: --host <h> / --public (=0.0.0.0) bind a shared/tunneled bus. A distributed
// team runs one `datumctl serve --public` (on a VM or a Tailscale/ngrok/
// cloudflared tunnel) and points datum.json.bus_url at it.

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
  usage: "datum serve [--port N] [--host H] [--public]",
  group: "ops",
  help:
    "Binds 127.0.0.1 by default. --public (or --host 0.0.0.0) opens it to the\n" +
    "network so a distributed team can share one bus. Run it on a VM or behind a\n" +
    "Tailscale/ngrok/cloudflared tunnel and point datum.json.bus_url at the URL.",
  async run(ctx) {
    const port = num(ctx.flags.port);
    const isPublic = ctx.flags.public === true || ctx.flags.public === "true";
    const hostFlag = typeof ctx.flags.host === "string" ? ctx.flags.host : undefined;
    const host = isPublic ? "0.0.0.0" : hostFlag;
    const shared = host === "0.0.0.0" || host === "::" || (!!host && host !== "127.0.0.1" && host !== "localhost");

    try {
      const startOpts: { port?: number; host?: string } = {};
      if (port != null) startOpts.port = port;
      if (host) startOpts.host = host;
      const bus = await startBus(startOpts);

      if (ctx.json) {
        out(JSON.stringify({ url: bus.url, port: bus.port, host: bus.host, public: shared }));
      } else {
        out(`${mark()} ${synced("bus")} listening on ${ident(bus.url)} ${ambient(`(bind ${bus.host})`)}`);
        if (shared) {
          out(ambient(`shared bus — teammates set datum.json bus_url to your reachable URL`));
          out(
            ambient(
              `tunnel hint: tailscale (tailscale serve ${bus.port}) · ngrok (ngrok http ${bus.port}) · cloudflared (cloudflared tunnel --url http://localhost:${bus.port})`,
            ),
          );
        } else {
          out(ambient("ctrl-c to stop · point sessions here with DATUM_BUS_URL"));
        }
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
