// cli/commands/tower.ts — datum tower. Starts the read-only web tower
// (web/serve.ts), pointed at the resolved bus url. --open hints at the URL to
// visit (no browser launch in headless contexts).

import type { Command } from "./types.ts";
import { startTower } from "../../web/serve.ts";
import { out, ambient, synced, warn, mark, ident } from "../lib/format.ts";

function num(v: string | boolean | undefined): number | undefined {
  if (typeof v !== "string") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

export const towerCommand: Command = {
  name: "tower",
  summary: "start the read-only web tower",
  usage: "datum tower [--port N] [--open]",
  group: "ops",
  help: "The tower shows what no single cockpit can see: shared truth, presence, drift, ledger.",
  async run(ctx) {
    const port = num(ctx.flags.port);
    const open = ctx.flags.open === true || ctx.flags.open === "true";
    try {
      const tower = await startTower({ port, busUrl: ctx.busUrl });
      if (ctx.json) {
        out(JSON.stringify({ url: tower.url, port: tower.port, bus_url: ctx.busUrl }));
      } else {
        out(`${mark()} ${synced("tower")} listening on ${ident(tower.url)}`);
        out(ambient(`reading truth from ${ident(ctx.busUrl)}`));
        if (open) out(ambient(`open ${ident(tower.url)} in your browser`));
      }
      await new Promise<void>((resolve) => {
        const shutdown = () => {
          tower.close().then(resolve);
        };
        process.on("SIGINT", shutdown);
        process.on("SIGTERM", shutdown);
      });
      return 0;
    } catch (err) {
      warn(`tower: could not start (${err instanceof Error ? err.message : String(err)})`);
      return 1;
    }
  },
};
