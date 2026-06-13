// cli/commands/uninstall.ts — datum uninstall. Remove the datum hooks block from
// .claude/settings.json + delete .datum/. Reversible install -> reversible
// uninstall. Confirms unless --yes.

import { rmSync, existsSync } from "node:fs";
import { join } from "node:path";

import type { Command, Ctx } from "./types.ts";
import {
  out,
  emitJson,
  ambient,
  synced,
  warn,
  mark,
  ident,
} from "../lib/format.ts";
import {
  readSettings,
  writeSettings,
  settingsPath,
  type Settings,
} from "../lib/state.ts";

/** Strip every datum-* hook entry + mcpServers.datum from settings. */
function removeDatumBlock(settings: Settings): { settings: Settings; removed: string[] } {
  const removed: string[] = [];
  if (settings.hooks) {
    for (const [event, entries] of Object.entries(settings.hooks)) {
      const kept = entries
        .map((e) => {
          const hooks = e.hooks.filter((h) => {
            const isDatum =
              (h.args ?? []).some((a) => /datum-(join|claim|fence|guard)/.test(a)) ||
              /datum-(join|claim|fence|guard)/.test(h.command);
            if (isDatum) removed.push(`${event}:${(h.args ?? []).join(" ") || h.command}`);
            return !isDatum;
          });
          return { ...e, hooks };
        })
        .filter((e) => e.hooks.length > 0);
      if (kept.length > 0) settings.hooks[event] = kept;
      else delete settings.hooks[event];
    }
    if (Object.keys(settings.hooks).length === 0) delete settings.hooks;
  }
  if (settings.mcpServers && "datum" in settings.mcpServers) {
    delete settings.mcpServers.datum;
    removed.push("mcpServers.datum");
    if (Object.keys(settings.mcpServers).length === 0) delete settings.mcpServers;
  }
  return { settings, removed };
}

export const uninstallCommand: Command = {
  name: "uninstall",
  summary: "remove datum hooks + .datum/ (reversible)",
  usage: "datum uninstall [--yes]",
  group: "lifecycle",
  async run(ctx: Ctx) {
    const yes = ctx.flags.yes === true || ctx.flags.yes === "true";
    const sp = settingsPath(ctx.projectDir);
    const datumDir = join(ctx.projectDir, ".datum");
    const settings = readSettings(sp);

    if (!yes && !ctx.json) {
      out(`${mark()} ${ambient("uninstall will:")}`);
      out(ambient(`  - strip the datum hooks + mcpServers.datum from ${ident(sp)}`));
      out(ambient(`  - delete ${ident(datumDir)}`));
      out(ambient("re-run with --yes to proceed (non-interactive)."));
      return 0;
    }

    const removed: string[] = [];
    if (settings) {
      const r = removeDatumBlock(settings);
      writeSettings(r.settings, sp);
      removed.push(...r.removed);
    }
    let stateRemoved = false;
    if (existsSync(datumDir)) {
      try {
        rmSync(datumDir, { recursive: true, force: true });
        stateRemoved = true;
      } catch (err) {
        warn(`uninstall: could not remove ${datumDir} (${err instanceof Error ? err.message : String(err)})`);
      }
    }

    if (ctx.json) {
      emitJson({ removed_hooks: removed, state_removed: stateRemoved });
      return 0;
    }
    out(`${mark()} ${synced("uninstalled")}`);
    for (const r of removed) out(ambient(`  - removed ${ident(r)}`));
    if (stateRemoved) out(ambient(`  - removed ${ident(datumDir)}`));
    return 0;
  },
};
