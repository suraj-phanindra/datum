// cli/commands/claim.ts — datum claim [globs…] [--symbols x,y] [--add].
//
// Set or extend the session's claimed scope (PATCH /sessions/:id + local write-
// back). With no args, prints the current claim.

import type { Command } from "./types.ts";
import {
  out,
  emitJson,
  ambient,
  contract,
  synced,
  warn,
  mark,
  ident,
} from "../lib/format.ts";
import { patchState } from "../lib/state.ts";

function str(v: string | boolean | undefined): string | undefined {
  return typeof v === "string" ? v : undefined;
}

export const claimCommand: Command = {
  name: "claim",
  summary: "set or extend your claimed scope (files + symbols)",
  usage: "datum claim [globs…] [--symbols x,y] [--add]",
  group: "cockpit",
  async run(ctx) {
    const add = ctx.flags.add === true || ctx.flags.add === "true";
    const symbolsFlag = str(ctx.flags.symbols);
    const newFiles = ctx.args.filter(Boolean);
    const newSymbols = symbolsFlag
      ? symbolsFlag.split(",").map((s) => s.trim()).filter(Boolean)
      : [];

    // no args -> print current claim.
    if (newFiles.length === 0 && newSymbols.length === 0) {
      if (ctx.json) {
        emitJson({ claim_files: ctx.state.claim_files, claim_symbols: ctx.state.claim_symbols });
        return 0;
      }
      out(`${mark()} ${contract("claim")} ${ambient(`for ${ident(ctx.state.human || "(unset)")}`)}`);
      out(`  files ${ctx.state.claim_files.length ? ident(ctx.state.claim_files.join(", ")) : ambient("none")}`);
      out(`  syms  ${ctx.state.claim_symbols.length ? ident(ctx.state.claim_symbols.join(", ")) : ambient("none")}`);
      return 0;
    }

    const files = add ? dedupe([...ctx.state.claim_files, ...newFiles]) : newFiles;
    const symbols = add
      ? dedupe([...ctx.state.claim_symbols, ...newSymbols])
      : newSymbols.length
        ? newSymbols
        : ctx.state.claim_symbols;

    // PATCH the bus (fail-soft) + write back locally.
    if (ctx.state.session_id) {
      const r = await ctx.bus.patchSession(ctx.state.session_id, {
        claim_files: files,
        claim_symbols: symbols,
      });
      if (!r.ok) warn(`claim: bus unreachable (${r.error}); saved locally only.`);
    }
    patchState({ claim_files: files, claim_symbols: symbols }, ctx.projectDir);

    if (ctx.json) {
      emitJson({ claim_files: files, claim_symbols: symbols });
      return 0;
    }
    out(`${mark()} ${synced(add ? "extended" : "set")} claim`);
    out(`  files ${files.length ? ident(files.join(", ")) : ambient("none")}`);
    out(`  syms  ${symbols.length ? ident(symbols.join(", ")) : ambient("none")}`);
    return 0;
  },
};

function dedupe(xs: string[]): string[] {
  return [...new Set(xs)];
}
