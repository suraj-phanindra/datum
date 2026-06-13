// cli/commands/demo.ts — datum demo. Delegates to demo/datum-demo.ts (the
// headless scenario runner + verifier). Behavior preserved from the original
// router: if the runner is absent, print the manual-start hint and exit 0.

import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import type { Command } from "./types.ts";
import { out, ambient } from "../lib/format.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(HERE, "..", "..");

export const demoCommand: Command = {
  name: "demo",
  summary: "run the scripted workspace-invites scenario",
  usage: "datum demo",
  group: "ops",
  async run(ctx) {
    const demoPath = join(PROJECT_ROOT, "demo", "datum-demo.ts");
    if (existsSync(demoPath)) {
      const { spawnSync } = await import("node:child_process");
      const r = spawnSync(process.execPath, [demoPath, ...ctx.args], { stdio: "inherit" });
      return r.status ?? 0;
    }
    out(ambient("datum demo: the demo runner (demo/datum-demo.ts) isn't present yet."));
    out(
      ambient(
        "Start the bus with `datum serve`, run `datum init`, then open a Claude Code\n" +
          "session to watch the registry sync live.",
      ),
    );
    return 0;
  },
};
