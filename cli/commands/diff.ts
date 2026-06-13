// cli/commands/diff.ts — datum diff <contract> [vN vM]. Mechanical diff between
// two versions of a contract (default: previous -> current).

import type { Command, Ctx } from "./types.ts";
import type { ContractVersion } from "../../server/store.ts";
import {
  out,
  emitJson,
  ambient,
  contract as amber,
  fence,
  synced,
  warn,
  mark,
  ident,
} from "../lib/format.ts";
import { mechanicalText } from "./shared.ts";

function parseV(arg: string | undefined): number | undefined {
  if (!arg) return undefined;
  const n = Number(arg.replace(/^v/i, ""));
  return Number.isFinite(n) ? n : undefined;
}

/** A line-level diff of two JSON snapshots' column/field sets. */
function diffSnapshots(a: string, b: string): { added: string[]; removed: string[] } {
  const colsOf = (s: string): string[] => {
    try {
      const v = JSON.parse(s) as { columns?: string[] };
      return Array.isArray(v.columns) ? v.columns : [];
    } catch {
      return [];
    }
  };
  const ca = new Set(colsOf(a));
  const cb = new Set(colsOf(b));
  const added = [...cb].filter((c) => !ca.has(c));
  const removed = [...ca].filter((c) => !cb.has(c));
  return { added, removed };
}

export const diffCommand: Command = {
  name: "diff",
  summary: "mechanical diff between two versions of a contract",
  usage: "datum diff <contract> [vN vM]",
  group: "truth",
  async run(ctx: Ctx) {
    const id = ctx.args[0];
    if (!id) {
      warn("diff: needs a contract, e.g. datum diff db.users");
      return 1;
    }
    const res = await ctx.bus.contractVersions(id);
    if (!res.ok) {
      warn(`diff: bus unreachable at ${ctx.busUrl} (${res.error}).`);
      return 1;
    }
    if (!res.contract) {
      warn(`diff: no contract "${id}".`);
      return 1;
    }
    const versions = res.versions as ContractVersion[];
    const current = res.contract.current_version;
    const to = parseV(ctx.args[2]) ?? parseV(ctx.args[1]) ?? current;
    const from = ctx.args[2] != null ? parseV(ctx.args[1]) ?? to - 1 : to - 1;

    const vFrom = versions.find((v) => v.version === from);
    const vTo = versions.find((v) => v.version === to);

    const snap = diffSnapshots(vFrom?.value_snapshot ?? "{}", vTo?.value_snapshot ?? res.contract.current_value);

    if (ctx.json) {
      emitJson({
        contract: id,
        from,
        to,
        added: snap.added,
        removed: snap.removed,
        mechanical_change: vTo?.mechanical_change ?? null,
      });
      return 0;
    }

    out(`${mark()} ${ident(id)} ${ambient(`· diff`)} ${amber(`v${from}`)} ${ambient("→")} ${amber(`v${to}`)}`);
    if (vTo) {
      out(`  ${ambient("change")} ${ident(mechanicalText(vTo.mechanical_change))} ${ambient(`· ${vTo.author}`)}`);
    }
    for (const c of snap.removed) out(`  ${fence(`- ${c}`)}`);
    for (const c of snap.added) out(`  ${synced(`+ ${c}`)}`);
    if (snap.added.length === 0 && snap.removed.length === 0 && !vTo) {
      out(ambient("  (no recorded version delta between those versions)"));
    }
    return 0;
  },
};
