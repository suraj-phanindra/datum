// cli/commands/index.ts — the COMMAND REGISTRY. The one file that lists every
// command. The router parses argv + global flags and dispatches into this map.

import type { Command } from "./types.ts";

import { helpCommand } from "./help.ts";
import { versionCommand } from "./version.ts";
import { initCommand } from "./init.ts";
import { doctorCommand } from "./doctor.ts";
import { uninstallCommand } from "./uninstall.ts";
import { statusCommand } from "./status.ts";
import { teamCommand } from "./team.ts";
import { syncCommand } from "./sync.ts";
import { claimCommand } from "./claim.ts";
import { advisoriesCommand } from "./advisories.ts";
import { checkCommand } from "./check.ts";
import { watchCommand } from "./watch.ts";
import { registryCommand } from "./registry.ts";
import { showCommand } from "./show.ts";
import { diffCommand } from "./diff.ts";
import { logCommand } from "./log.ts";
import { decideCommand } from "./decide.ts";
import { serveCommand } from "./serve.ts";
import { towerCommand } from "./tower.ts";
import { demoCommand } from "./demo.ts";

/** The ordered command list (grouped help renders in this order). */
export const COMMAND_LIST: Command[] = [
  // lifecycle / meta
  helpCommand,
  versionCommand,
  initCommand,
  doctorCommand,
  uninstallCommand,
  // cockpit (daily driver)
  statusCommand,
  teamCommand,
  syncCommand,
  claimCommand,
  advisoriesCommand,
  checkCommand,
  watchCommand,
  // truth / history
  registryCommand,
  showCommand,
  diffCommand,
  logCommand,
  decideCommand,
  // ops / servers
  serveCommand,
  towerCommand,
  demoCommand,
];

/** name + alias -> Command. */
export const COMMANDS: Map<string, Command> = (() => {
  const m = new Map<string, Command>();
  for (const c of COMMAND_LIST) {
    m.set(c.name, c);
    for (const a of c.aliases ?? []) m.set(a, c);
  }
  return m;
})();

export function lookup(name: string): Command | undefined {
  return COMMANDS.get(name);
}
