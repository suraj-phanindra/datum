// cli/commands/init.ts — datum init. Wires .claude/settings.json hooks + MCP and
// seeds .datum/state.json. Thin wrapper over cli/init.ts (the hooks-installer);
// behavior preserved verbatim from the original router.

import type { Command } from "./types.ts";
import { init, DEFAULT_BUS_URL } from "../init.ts";
import { out, emitJson, ambient, synced, mark, ident } from "../lib/format.ts";

function str(v: string | boolean | undefined): string | undefined {
  return typeof v === "string" ? v : undefined;
}

export const initCommand: Command = {
  name: "init",
  summary: "wire Claude Code hooks + MCP, seed local state",
  usage:
    "datum init [--human NAME] [--branch B] [--files a,b] [--symbols x,y] [--bus-url URL]",
  group: "lifecycle",
  help:
    "Idempotent. Merges the datum block into .claude/settings.json (SessionStart,\n" +
    "PostToolUse, PreToolUse hooks + mcpServers.datum) and seeds .datum/state.json.",
  async run(ctx) {
    const projectDir =
      str(ctx.flags["project-dir"]) || ctx.projectDir;
    const busUrl =
      str(ctx.flags["bus-url"]) || process.env.DATUM_BUS_URL || DEFAULT_BUS_URL;
    const files = str(ctx.flags.files);
    const symbols = str(ctx.flags.symbols);

    const result = init({
      projectDir,
      busUrl,
      human: str(ctx.flags.human) || process.env.DATUM_HUMAN,
      branch: str(ctx.flags.branch) || process.env.DATUM_BRANCH,
      claimFiles: files ? files.split(",").map((s) => s.trim()).filter(Boolean) : undefined,
      claimSymbols: symbols ? symbols.split(",").map((s) => s.trim()).filter(Boolean) : undefined,
    });

    if (ctx.json) {
      emitJson({
        wired: result.wired,
        settings_path: result.settingsPath,
        state_path: result.statePath,
        state: result.state,
      });
      return 0;
    }

    out(`${mark()} ${synced("wired")} Claude Code coordination:`);
    for (const w of result.wired) out(ambient(`  - ${w}`));
    out(ambient(`  settings: ${ident(result.settingsPath)}`));
    out(ambient(`  state:    ${ident(result.statePath)} (bus ${ident(result.state.bus_url)})`));
    return 0;
  },
};
