// cli/commands/help.ts — datum help [command] / --help / -h.
//
// With no argument: the grouped global usage. With a command name: that
// command's usage + summary + (optional) help body. The grouped listing is the
// self-documenting product surface, like `git help` / `gh help`.

import type { Command, Ctx, CommandGroup } from "./types.ts";
import { out, emitJson, ambient, bold, contract, mark, ident } from "../lib/format.ts";
import { datumVersion } from "./version.ts";

const GROUP_TITLES: Record<CommandGroup, string> = {
  lifecycle: "lifecycle / meta",
  cockpit: "cockpit (daily driver)",
  truth: "truth / history",
  ops: "ops / servers",
};

const GROUP_ORDER: CommandGroup[] = ["lifecycle", "cockpit", "truth", "ops"];

/** Render the grouped global help to stdout. */
export function printGlobalHelp(commands: Command[], busUrl: string): void {
  out(`${mark()} ${bold("datum")} ${ambient(`v${datumVersion()}`)} ${ambient("— the coordination layer for teams of Claude Code agents.")}`);
  out("");
  out(ambient("Usage: datum <command> [args] [--json] [--no-color] [--bus-url URL]"));
  out("");

  // unique commands in declaration order, grouped.
  const seen = new Set<string>();
  for (const group of GROUP_ORDER) {
    const inGroup = commands.filter((c) => c.group === group && !seen.has(c.name));
    if (inGroup.length === 0) continue;
    out(contract(GROUP_TITLES[group]));
    const width = Math.max(...inGroup.map((c) => c.name.length + (c.aliases?.length ? aliasLabel(c).length : 0)));
    for (const c of inGroup) {
      seen.add(c.name);
      const label = c.name + (c.aliases?.length ? aliasLabel(c) : "");
      out(`  ${ident(label.padEnd(width + 2))} ${ambient(c.summary)}`);
    }
    out("");
  }

  out(ambient("Exit codes: 0 ok · 1 error · 2 drift detected (check/doctor when behind)."));
  out(ambient(`Bus: ${ident(busUrl)} (override with --bus-url or DATUM_BUS_URL).`));
  out(ambient("`datum help <command>` for details on one command."));
}

function aliasLabel(c: Command): string {
  return ` (${(c.aliases ?? []).join(", ")})`;
}

/** Render per-command help. */
export function printCommandHelp(c: Command): void {
  out(`${mark()} ${ident(c.name)}${c.aliases?.length ? ambient(` (alias ${c.aliases.join(", ")})`) : ""}`);
  out(`  ${ambient(c.summary)}`);
  out("");
  out(`  ${bold("usage")}  ${ident(c.usage)}`);
  if (c.help) {
    out("");
    for (const line of c.help.split("\n")) out(`  ${ambient(line)}`);
  }
}

export const helpCommand: Command = {
  name: "help",
  summary: "show grouped usage, or help for one command",
  usage: "datum help [command]",
  group: "lifecycle",
  async run(ctx: Ctx) {
    const { COMMAND_LIST, lookup } = await import("./index.ts");
    const target = ctx.args[0];

    if (target) {
      const c = lookup(target);
      if (!c) {
        // unknown command in help -> still exit 0 (help is informational) but say so.
        out(ambient(`datum: no command "${target}". Try \`datum help\`.`));
        return 0;
      }
      if (ctx.json) {
        emitJson({ name: c.name, aliases: c.aliases ?? [], summary: c.summary, usage: c.usage, group: c.group });
        return 0;
      }
      printCommandHelp(c);
      return 0;
    }

    if (ctx.json) {
      emitJson({
        version: datumVersion(),
        bus_url: ctx.busUrl,
        commands: COMMAND_LIST.map((c) => ({
          name: c.name,
          aliases: c.aliases ?? [],
          summary: c.summary,
          group: c.group,
        })),
      });
      return 0;
    }

    printGlobalHelp(COMMAND_LIST, ctx.busUrl);
    return 0;
  },
};
