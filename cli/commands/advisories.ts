// cli/commands/advisories.ts — datum advisories [--watch].
//
// The per-recipient advisories addressed to your session (severity-colored:
// fence=red, advisory=blue). --json emits the raw advisory array. --watch tails
// new advisory.delivered events over SSE.

import type { Command, Ctx } from "./types.ts";
import type { Event } from "../../server/store.ts";
import {
  out,
  emitJson,
  ambient,
  fence,
  advisory,
  warn,
  mark,
  ident,
} from "../lib/format.ts";

function renderAdvisory(a: Record<string, unknown>): void {
  const sev = String(a.severity ?? "advisory");
  const tone = sev === "fence" ? fence : advisory;
  out(`  ${tone(`[${sev}]`)} ${ident(String(a.file ?? ""))}`);
  if (a.body) out(`    ${ambient(String(a.body))}`);
  const actions = Array.isArray(a.actions) ? (a.actions as string[]) : [];
  for (const act of actions) out(`    ${ambient("→")} ${ident(act)}`);
}

export const advisoriesCommand: Command = {
  name: "advisories",
  summary: "advisories addressed to you (severity-colored)",
  usage: "datum advisories [--watch] [--json]",
  group: "cockpit",
  async run(ctx) {
    if (!ctx.state.session_id) {
      warn("advisories: no session — run `datum init` first.");
      return 1;
    }
    const res = await ctx.bus.advisories(ctx.state.session_id);
    if (!res.ok) {
      warn(`advisories: bus unreachable at ${ctx.busUrl} (${res.error}).`);
      return 1;
    }
    const advisories = res.advisories as Array<Record<string, unknown>>;

    if (ctx.json && !(ctx.flags.watch === true)) {
      emitJson({ advisories });
      return 0;
    }

    if (advisories.length === 0) {
      out(`${mark()} ${ambient("no advisories for you")}`);
    } else {
      out(`${mark()} ${advisory("advisories")} ${ambient(`for ${ident(ctx.state.human || ctx.state.session_id)}`)}`);
      for (const a of advisories) renderAdvisory(a);
    }

    if (ctx.flags.watch === true || ctx.flags.watch === "true") {
      return tailAdvisories(ctx);
    }
    return 0;
  },
};

function tailAdvisories(ctx: Ctx): Promise<number> {
  return new Promise<number>((resolve) => {
    out(ambient("watching for new advisories… (ctrl-c to stop)"));
    let stop = () => {};
    ctx.bus
      .stream(
        (ev: Event) => {
          if (ev.type !== "advisory.delivered") return;
          const p = ev.payload as { session_id?: string; advisory?: Record<string, unknown> };
          if (p.session_id !== ctx.state.session_id) return;
          if (p.advisory) renderAdvisory(p.advisory);
        },
        {
          onError: (e) => {
            warn(`advisories --watch: stream ended (${e}).`);
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
}
