// cli/commands/log.ts — datum log (alias `ledger`). The decision history,
// newest-first, like `git log`: #id  ts  author · description.

import type { Command, Ctx } from "./types.ts";
import type { LedgerEntry } from "../../server/store.ts";
import {
  out,
  emitJson,
  ambient,
  warn,
  mark,
  ident,
} from "../lib/format.ts";

function num(v: string | boolean | undefined): number | undefined {
  if (typeof v !== "string") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

export const logCommand: Command = {
  name: "log",
  aliases: ["ledger"],
  summary: "decision history (#id ts author · description)",
  usage: "datum log [--limit N] [--json]",
  group: "truth",
  async run(ctx: Ctx) {
    const res = await ctx.bus.ledger();
    if (!res.ok) {
      warn(`log: bus unreachable at ${ctx.busUrl} (${res.error}).`);
      return 1;
    }
    const limit = num(ctx.flags.limit) ?? 20;
    const entries = (res.ledger as LedgerEntry[]).slice(0, Math.max(0, limit));

    if (ctx.json) {
      emitJson({ ledger: entries });
      return 0;
    }

    out(`${mark()} ${ambient("ledger")}`);
    for (const e of entries) {
      const id = ident(`#${e.id}`);
      const ts = ambient(shortTs(e.ts));
      const author = ident(e.author);
      const link = e.contract_id ? ambient(` (${e.contract_id})`) : "";
      out(`  ${id}  ${ts}  ${author} ${ambient("·")} ${ident(e.description)}${link}`);
    }
    return 0;
  },
};

/** "14:02" from an ISO timestamp (the ledger demo format). */
function shortTs(iso: string): string {
  const m = /T(\d{2}:\d{2})/.exec(iso);
  return m ? m[1] : iso;
}
