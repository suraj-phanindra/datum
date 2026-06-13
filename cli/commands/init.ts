// cli/commands/init.ts — datum init. Wires .claude/settings.json hooks + MCP and
// seeds .datum/state.json. Thin wrapper over cli/init.ts (the hooks-installer);
// behavior preserved verbatim from the original router.

import type { Command } from "./types.ts";
import { init } from "../init.ts";
import { out, emitJson, ambient, synced, contract, mark, ident } from "../lib/format.ts";

function str(v: string | boolean | undefined): string | undefined {
  return typeof v === "string" ? v : undefined;
}

export const initCommand: Command = {
  name: "init",
  summary: "wire Claude Code hooks + MCP, seed local state, join the team",
  usage:
    "datum init [--human NAME] [--branch B] [--workspace ID] [--files a,b] [--symbols x,y] [--bus-url URL]",
  group: "lifecycle",
  help:
    "Idempotent + git-native. Derives your identity from git (human <- user.name,\n" +
    "email <- user.email, branch <- current branch) and the workspace_id from the\n" +
    "origin remote. The first init CREATES the committed datum.json (shared team\n" +
    "config); later inits READ it. Merges the datum block into .claude/settings.json\n" +
    "(SessionStart/PostToolUse/PreToolUse hooks + mcpServers.datum) and seeds\n" +
    ".datum/state.json. Flags --human/--branch/--workspace override the derivation.",
  async run(ctx) {
    const projectDir = str(ctx.flags["project-dir"]) || ctx.projectDir;
    const files = str(ctx.flags.files);
    const symbols = str(ctx.flags.symbols);

    const result = init({
      projectDir,
      // bus_url precedence (datum.json < env < flag) is resolved inside init();
      // only forward an explicit flag here so env/datum.json can win otherwise.
      busUrl: str(ctx.flags["bus-url"]),
      human: str(ctx.flags.human),
      branch: str(ctx.flags.branch),
      workspaceId: str(ctx.flags.workspace),
      claimFiles: files ? files.split(",").map((s) => s.trim()).filter(Boolean) : undefined,
      claimSymbols: symbols ? symbols.split(",").map((s) => s.trim()).filter(Boolean) : undefined,
    });

    if (ctx.json) {
      emitJson({
        wired: result.wired,
        settings_path: result.settingsPath,
        state_path: result.statePath,
        config_path: result.configPath,
        config_created: result.configCreated,
        workspace_id: result.state.workspace_id,
        config: result.config,
        state: result.state,
      });
      return 0;
    }

    out(`${mark()} ${synced("wired")} Claude Code coordination:`);
    for (const w of result.wired) out(ambient(`  - ${w}`));
    out(ambient(`  settings:  ${ident(result.settingsPath)}`));
    out(ambient(`  state:     ${ident(result.statePath)} (bus ${ident(result.state.bus_url)})`));
    const cfgNote = result.configCreated ? " (created — commit it to share the team)" : " (shared team config)";
    out(ambient(`  datum.json:${ident(result.configPath)}${cfgNote}`));
    const who = result.state.human + (result.state.email ? ` <${result.state.email}>` : "");
    out("");
    out(`  ${ambient("team")}   ${contract(ident(result.state.workspace_id))}`);
    out(`  ${ambient("you")}    ${ident(who)} ${ambient("·")} ${ident(result.state.branch)}`);
    return 0;
  },
};
