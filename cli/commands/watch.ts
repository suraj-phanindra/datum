// cli/commands/watch.ts — datum watch. Live-tail the bus events (SSE),
// color-coded by type: delta=amber, fenced=red, advisory=blue, reconciled=green,
// everything else ambient. `tail -f` for coordination.

import type { Command, Ctx } from "./types.ts";
import type { Event } from "../../server/store.ts";
import {
  out,
  ambient,
  contract,
  fence,
  advisory,
  synced,
  warn,
  mark,
  ident,
  relTime,
} from "../lib/format.ts";
import { mechanicalText } from "./shared.ts";

function renderEvent(ev: Event): void {
  const ts = ambient(relTime(ev.ts) || "now");
  const p = ev.payload as Record<string, unknown>;
  switch (ev.type) {
    case "delta.detected": {
      const mc = (p.mechanical_change ?? {}) as Parameters<typeof mechanicalText>[0];
      out(
        `${contract("delta")}   ${ts} ${contract(`v${p.epoch}`)} ${ident(String(p.contract_id))} ${ambient("·")} ${ident(mechanicalText(mc))} ${ambient(`· ${p.author}`)}`,
      );
      break;
    }
    case "write.fenced":
      out(`${fence("fenced")}  ${ts} ${ident(String(p.human ?? ""))} ${ambient("·")} ${ident(String(p.path ?? ""))} ${ambient(`· ${String(p.reason ?? "")}`)}`);
      break;
    case "advisory.delivered": {
      const adv = (p.advisory ?? {}) as Record<string, unknown>;
      out(`${advisory("advisory")} ${ts} ${ident(String(p.recipient ?? adv.recipient ?? ""))} ${ambient("·")} ${ident(String(adv.file ?? ""))}`);
      break;
    }
    case "reconciled": {
      const scope = p.workspace ? "workspace" : String(p.human ?? "");
      out(`${synced("reconciled")} ${ts} ${ident(scope)} ${ambient("·")} ${ident(String(p.contract_id ?? ""))}`);
      break;
    }
    case "spec.pr.opened":
      out(`${contract("spec-pr")} ${ts} ${ident(`#${p.pr_number}`)} ${ambient("·")} ${ident(String(p.contract_id ?? ""))}`);
      break;
    case "session.joined":
      out(`${ambient("joined")}  ${ts} ${ident(String(p.human ?? ""))} ${ambient(`· ${String(p.branch ?? "")}`)}`);
      break;
    case "edit.streamed":
      out(`${ambient("edit")}    ${ts} ${ident(String(p.human ?? ""))} ${ambient("·")} ${ident(String(p.path ?? ""))}`);
      break;
    case "claim.published":
      out(`${ambient("claim")}   ${ts} ${ident(String(p.human ?? ""))}`);
      break;
    default:
      out(`${ambient(ev.type)} ${ts}`);
  }
}

export const watchCommand: Command = {
  name: "watch",
  summary: "live-tail bus events, color-coded (tail -f for coordination)",
  usage: "datum watch",
  group: "cockpit",
  async run(ctx: Ctx) {
    // backfill recent events so a fresh watch shows context, then tail.
    const back = await ctx.bus.eventsSince(0);
    if (!back.ok) {
      warn(`watch: bus unreachable at ${ctx.busUrl} (${back.error}).`);
      return 1;
    }
    out(`${mark()} ${ambient(`tailing ${ctx.busUrl}/stream (ctrl-c to stop)`)}`);
    let lastId = 0;
    for (const ev of back.events.slice(-10)) {
      renderEvent(ev);
      lastId = ev.id;
    }

    return new Promise<number>((resolve) => {
      let stop = () => {};
      ctx.bus
        .stream(
          (ev) => {
            if (ev.id <= lastId) return; // dedupe against backfill
            lastId = ev.id;
            renderEvent(ev);
          },
          {
            onError: (e) => {
              warn(`watch: stream ended (${e}).`);
              resolve(1);
            },
          },
        )
        .then((s) => (stop = s));
      const shutdown = () => {
        stop();
        resolve(0);
      };
      process.on("SIGINT", shutdown);
      process.on("SIGTERM", shutdown);
    });
  },
};
