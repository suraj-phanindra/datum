// cli/commands/check.ts — datum check [path] [--content -].
//
// Dry-run the fence (server/fence.ts decideFence): would an edit to `path` be
// fenced against fresh deltas? Reads the write content from stdin with
// `--content -`, else uses --content TEXT, else scans the path's basename so a
// claim-scoped check still exercises the symbol match.
//
// Prints allow / inject / deny + the stale symbol + the deny reason naming
// contract / change / author. Exit 2 on deny so it composes in scripts:
//   datum check routes/users.ts && $EDITOR routes/users.ts

import { readFileSync } from "node:fs";

import type { Command, Ctx } from "./types.ts";
import { decideFence } from "../../server/fence.ts";
import type { Delta } from "../../server/store.ts";
import {
  out,
  emitJson,
  ambient,
  fence,
  synced,
  contract,
  warn,
  mark,
  ident,
} from "../lib/format.ts";

function str(v: string | boolean | undefined): string | undefined {
  return typeof v === "string" ? v : undefined;
}

function readStdin(): string {
  try {
    return readFileSync(0, "utf8");
  } catch {
    return "";
  }
}

/** Resolve the write content to fence-check. */
function resolveContent(ctx: Ctx, path: string): string {
  const flag = str(ctx.flags.content);
  if (flag === "-") return readStdin();
  if (flag != null) return flag;
  // No explicit content: synthesize a representative reference from the path so a
  // claim-scoped check still exercises the symbol match. We seed the content with
  // the session's claimed symbols (they describe what this file references).
  return [path, ...ctx.state.claim_symbols].join("\n");
}

export const checkCommand: Command = {
  name: "check",
  summary: "dry-run the fence against fresh deltas (exit 2 on deny)",
  usage: "datum check [path] [--content -|TEXT] [--tool Edit]",
  group: "cockpit",
  help:
    "Composes in scripts: `datum check routes/users.ts && $EDITOR routes/users.ts`.\n" +
    "Exit 0 allow, 0 inject (with context), 2 deny (drift).",
  async run(ctx) {
    const path = ctx.args[0] || ctx.state.claim_files[0] || "";
    if (!path) {
      warn("check: needs a path (or a claim) — e.g. datum check routes/users.ts");
      return 1;
    }
    const tool = str(ctx.flags.tool) || "Edit";
    const content = resolveContent(ctx, path);

    // current epoch from the bus (fail-soft -> fail open: allow on a down bus).
    const vres = await ctx.bus.version();
    if (!vres.ok) {
      warn(`check: bus unreachable at ${ctx.busUrl} (${vres.error}); failing open (allow).`);
      if (ctx.json) emitJson({ decision: "allow", reachable: false });
      else out(`${mark()} ${synced("allow")} ${ambient("(bus unreachable — fail open)")}`);
      return 0;
    }
    const currentVersion = vres.registry_version;
    const lastSyncedVersion = ctx.state.last_synced_version;

    // deltas in (lastSynced, current].
    const dres = await ctx.bus.deltas(lastSyncedVersion);
    const deltas: Delta[] = dres.ok ? dres.deltas : [];

    const decision = decideFence({
      write: { path, tool_name: tool, content },
      lastSyncedVersion,
      currentVersion,
      deltas,
    });

    if (ctx.json) {
      emitJson({ path, ...decision, last_synced_version: lastSyncedVersion, current_version: currentVersion });
    } else {
      switch (decision.decision) {
        case "allow":
          out(`${mark()} ${synced("allow")} ${ident(path)}`);
          break;
        case "inject":
          out(`${mark()} ${advisoryTone("inject")} ${ident(path)}`);
          out(`  ${ambient(decision.additionalContext)}`);
          break;
        case "deny":
          out(`${mark()} ${fence("deny")} ${ident(path)}`);
          out(`  ${fence(decision.reason)}`);
          break;
      }
    }
    return decision.decision === "deny" ? 2 : 0;
  },
};

function advisoryTone(s: string): string {
  return contract(s);
}
