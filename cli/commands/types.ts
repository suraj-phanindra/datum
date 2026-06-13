// cli/commands/types.ts — the command contract + the dispatch context.
//
// A command is a small record { name, aliases?, summary, usage, group, run }.
// run(ctx) -> Promise<number> returns the process exit code (0 ok, 1 error, 2
// drift). The router builds the Ctx once and hands it to the matched command.

import type { BusClient } from "../lib/client.ts";
import type { DatumState } from "../lib/state.ts";

export type CommandGroup = "lifecycle" | "cockpit" | "truth" | "ops";

export type Ctx = {
  /** Positional args after the command name. */
  args: string[];
  /** Parsed flags (string|boolean). Repeated flags keep the last value. */
  flags: Record<string, string | boolean>;
  /** --json mode requested. */
  json: boolean;
  /** Resolved bus url (--bus-url / DATUM_BUS_URL / state.bus_url / default). */
  busUrl: string;
  /** A fail-soft bus client bound to busUrl. */
  bus: BusClient;
  /** The project root (CLAUDE_PROJECT_DIR or cwd). */
  projectDir: string;
  /** The local state (typed empty shape if none on disk). */
  state: DatumState;
  /** True iff .datum/state.json exists on disk. */
  hasState: boolean;
};

export type Command = {
  name: string;
  aliases?: string[];
  summary: string;
  usage: string;
  group: CommandGroup;
  /** Optional longer per-command help body (printed after usage). */
  help?: string;
  run(ctx: Ctx): Promise<number>;
};
