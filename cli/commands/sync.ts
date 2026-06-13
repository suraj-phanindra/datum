// cli/commands/sync.ts — datum sync. Pull /registry + /deltas?since, advance
// last_synced_version (PATCH /sessions/:id + write-back to .datum/state.json),
// and print what changed since you last synced. This is the "re-sync to v8" the
// fence deny instructs you to run.

import type { Command } from "./types.ts";
import type { Delta } from "../../server/store.ts";
import {
  out,
  emitJson,
  ambient,
  contract,
  synced,
  warn,
  mark,
  ident,
  relTime,
} from "../lib/format.ts";
import { patchState } from "../lib/state.ts";
import { mechanicalText } from "./shared.ts";

export const syncCommand: Command = {
  name: "sync",
  summary: "advance to the current epoch; print what changed",
  usage: "datum sync [--json]",
  group: "cockpit",
  async run(ctx) {
    const from = ctx.state.last_synced_version;
    const vres = await ctx.bus.version();
    if (!vres.ok) {
      warn(`sync: bus unreachable at ${ctx.busUrl} (${vres.error}); still at v${from}.`);
      return 1;
    }
    const to = vres.registry_version;

    // deltas in (from, to] — what landed while we were behind.
    const dres = await ctx.bus.deltas(from);
    const deltas: Delta[] = dres.ok ? dres.deltas : [];

    // advance the session on the bus (re-sync write-back) when we have an id.
    if (ctx.state.session_id) {
      await ctx.bus.patchSession(ctx.state.session_id, { last_synced_version: to });
    }
    // write-back locally so the fence fast-path clears.
    patchState({ last_synced_version: to }, ctx.projectDir);

    if (ctx.json) {
      emitJson({ from, to, advanced: to > from, deltas });
      return 0;
    }

    if (to === from) {
      out(`${mark()} ${synced(`already synced to v${to}`)}`);
      return 0;
    }
    out(`${mark()} ${synced(`re-baselined`)} ${ambient(`v${from} → `)}${contract(`v${to}`)}`);
    if (deltas.length) {
      out(ambient(`  ${deltas.length} ${deltas.length === 1 ? "delta" : "deltas"} since:`));
      for (const d of deltas) {
        out(
          `    ${contract(`v${d.epoch}`)} ${ident(d.contract_id)} ${ambient("·")} ${ident(mechanicalText(d.mechanical_change))} ${ambient(`· ${d.author} ${relTime(d.ts)}`)}`,
        );
      }
    }
    return 0;
  },
};
