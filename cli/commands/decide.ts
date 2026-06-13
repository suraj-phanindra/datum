// cli/commands/decide.ts — datum decide "<text>" [--contract ID].
//
// Records a free-form decision via POST /decide. Epoch-NEUTRAL (schema §4): the
// returned registry_version is unchanged. Fail-soft: a down bus prints a warning
// and exits 1 (a decision can't be recorded offline), never a stack trace.

import type { Command } from "./types.ts";
import { out, emitJson, ambient, synced, warn, mark, ident } from "../lib/format.ts";

function str(v: string | boolean | undefined): string | undefined {
  return typeof v === "string" ? v : undefined;
}

export const decideCommand: Command = {
  name: "decide",
  summary: "record a free-form decision (epoch-neutral)",
  usage: 'datum decide "<decision>" [--author NAME] [--contract ID]',
  group: "truth",
  async run(ctx) {
    const description = ctx.args.join(" ").trim();
    if (!description) {
      warn('decide: needs a decision, e.g. datum decide "use SSE for the tower"');
      return 1;
    }
    const author =
      str(ctx.flags.author) || process.env.DATUM_HUMAN || ctx.state.human || "";
    const contract = str(ctx.flags.contract);

    const res = await ctx.bus.decide(author, description, contract);
    if (!res.ok) {
      warn(`decide: could not reach bus at ${ctx.busUrl} (${res.error}).`);
      return 1;
    }

    if (ctx.json) {
      emitJson({
        ledger_id: res.ledger_id,
        registry_version: res.registry_version,
        epoch_neutral: true,
      });
      return 0;
    }

    out(
      `${mark()} ${synced("recorded")} decision ${ident(`#${res.ledger_id}`)} ` +
        ambient(`(registry ${ident(`v${res.registry_version}`)}, epoch-neutral)`),
    );
    return 0;
  },
};
