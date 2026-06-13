#!/usr/bin/env node
// cli/datum.ts — the datum CLI entry + router.
//
// Parses argv + GLOBAL FLAGS (--bus-url/DATUM_BUS_URL, --json, --no-color,
// -h/--help, -v/--version), resolves the dispatch Ctx, and dispatches into the
// COMMANDS registry (cli/commands/index.ts). Self-documenting, fail-soft,
// scriptable (git/gh-shaped).
//
// Behavior:
//   bare `datum`        -> status if .datum/state.json exists, else help.
//   datum <cmd> ...      -> registry dispatch (run returns the exit code).
//   --help / -h          -> global or per-command help.
//   --version / -v       -> version.
//   unknown command      -> usage + exit 1.
//
// EXIT CODES: 0 ok · 1 error · 2 drift detected. The router never throws to the
// shell; an unexpected error prints a one-line warning and exits 1.

import { COMMANDS, COMMAND_LIST } from "./commands/index.ts";
import type { Command, Ctx } from "./commands/types.ts";
import { BusClient } from "./lib/client.ts";
import { DEFAULT_BUS_URL, readStateOrDefault, hasState, projectDir } from "./lib/state.ts";
import { disableColor, warn } from "./lib/format.ts";
import { printGlobalHelp, printCommandHelp } from "./commands/help.ts";
import { runAsEntry } from "../server/entry.ts";

// ---- global-flag parsing ----

type Parsed = {
  command?: string;
  args: string[];
  flags: Record<string, string | boolean>;
};

const VALUE_FLAGS = new Set(["bus-url", "content", "symbols", "branch", "human", "files", "author", "contract", "port", "limit", "tool", "project-dir", "workspace", "host"]);

/**
 * Parse argv into { command, args, flags }. The first non-flag token is the
 * command; everything after is the command's args. `--k v` consumes a value for
 * known value-flags or when the next token isn't another flag; `--k=v` always
 * binds; bare `--k` is boolean true. `-h/-v` are recognised globally.
 */
export function parseArgv(argv: string[]): Parsed {
  const flags: Record<string, string | boolean> = {};
  const args: string[] = [];
  let command: string | undefined;

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "-h" || a === "--help") {
      flags.help = true;
      continue;
    }
    if (a === "-v" || a === "--version") {
      flags.version = true;
      continue;
    }
    if (a.startsWith("--")) {
      const eq = a.indexOf("=");
      if (eq !== -1) {
        flags[a.slice(2, eq)] = a.slice(eq + 1);
        continue;
      }
      const key = a.slice(2);
      const next = argv[i + 1];
      // consume a value only for known value-flags. A lone "-" (stdin sentinel)
      // is a legal value; any other token starting with "-" is treated as the
      // next flag, so a value-flag with no value becomes boolean true.
      const nextIsValue = next != null && (next === "-" || !next.startsWith("-"));
      if (VALUE_FLAGS.has(key) && nextIsValue) {
        flags[key] = next;
        i++;
      } else {
        flags[key] = true;
      }
      continue;
    }
    if (command === undefined) command = a;
    else args.push(a);
  }
  return { command, args, flags };
}

// ---- bus url resolution ----

function resolveBusUrl(flags: Record<string, string | boolean>, stateBusUrl: string): string {
  const flag = flags["bus-url"];
  if (typeof flag === "string" && flag) return flag;
  if (process.env.DATUM_BUS_URL) return process.env.DATUM_BUS_URL;
  if (stateBusUrl) return stateBusUrl;
  return DEFAULT_BUS_URL;
}

// ---- main / run ----

/**
 * run — the testable router. Parses argv (sans node + script), builds the Ctx,
 * dispatches, and returns the exit code. Never throws (catches command errors
 * and returns 1 with a one-line warning).
 */
export async function run(argv: string[]): Promise<number> {
  const { command, args, flags } = parseArgv(argv);

  // global color discipline: --no-color or --json disables ANSI.
  const json = flags.json === true;
  if (flags["no-color"] === true || json) disableColor();

  const dir = projectDir();
  const state = readStateOrDefault(dir);
  const busUrl = resolveBusUrl(flags, state.bus_url);
  const ctx: Ctx = {
    args,
    flags,
    json,
    busUrl,
    bus: new BusClient(busUrl),
    projectDir: dir,
    state,
    hasState: hasState(dir),
  };

  // -v / --version (global)
  if (flags.version === true && command === undefined) {
    return dispatch(COMMANDS.get("version")!, ctx);
  }

  // -h / --help (global, no command) -> grouped help.
  if (flags.help === true && command === undefined) {
    if (json) return dispatch(COMMANDS.get("help")!, ctx);
    printGlobalHelp(COMMAND_LIST, busUrl);
    return 0;
  }

  // bare `datum` -> status if state exists, else help.
  if (command === undefined) {
    if (ctx.hasState) return dispatch(COMMANDS.get("status")!, ctx);
    printGlobalHelp(COMMAND_LIST, busUrl);
    return 0;
  }

  const cmd = COMMANDS.get(command);
  if (!cmd) {
    warn(`unknown command "${command}".`);
    printGlobalHelp(COMMAND_LIST, busUrl);
    return 1;
  }

  // per-command --help / -h -> that command's help.
  if (flags.help === true) {
    if (json) {
      ctx.args = [cmd.name];
      return dispatch(COMMANDS.get("help")!, ctx);
    }
    printCommandHelp(cmd);
    return 0;
  }

  return dispatch(cmd, ctx);
}

async function dispatch(cmd: Command, ctx: Ctx): Promise<number> {
  try {
    const code = await cmd.run(ctx);
    return typeof code === "number" ? code : 0;
  } catch (err) {
    // fail-soft: never leak a stack trace to the shell.
    warn(`${cmd.name}: ${err instanceof Error ? err.message : String(err)}`);
    return 1;
  }
}

/** main — process entry. */
export async function main(argv: string[]): Promise<number> {
  return run(argv);
}

// run directly: `node cli/datum.ts ...` (dev) or the bundled dist/datum.js bin
// (dist). The bundled bin inlines server/index.ts + the hooks; runAsEntry keeps
// only the "cli" entry's main() live so the inlined bus/hook auto-run blocks stay
// dormant (no second bus on the port).
const isMain = runAsEntry(import.meta.url, "cli");

if (isMain) {
  main(process.argv.slice(2))
    .then((code) => process.exit(code))
    .catch((err) => {
      warn(err instanceof Error ? err.message : String(err));
      process.exit(1);
    });
}
