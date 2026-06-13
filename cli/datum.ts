#!/usr/bin/env node
// cli/datum.ts — the `npx datum` entry point. Subcommands:
//   datum init            wire .claude/settings.json + seed .datum/state.json
//   datum decide "..."    POST /decide a free-form decision (epoch-neutral)
//   datum demo            delegate to demo/datum-demo.ts if present
//
// Minimal arg parsing; Node built-ins only. Never crashes the user's shell on a
// bad subcommand — prints usage and exits non-zero only on genuine errors.

import { existsSync, readFileSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { init, DEFAULT_BUS_URL } from "./init.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(HERE, "..");

async function main(argv: string[]): Promise<number> {
  const [cmd, ...rest] = argv;

  switch (cmd) {
    case "init":
      return cmdInit(rest);
    case "decide":
      return cmdDecide(rest);
    case "demo":
      return cmdDemo(rest);
    case undefined:
    case "help":
    case "-h":
    case "--help":
      printUsage();
      return cmd === undefined ? 1 : 0;
    default:
      console.error(`datum: unknown command "${cmd}"\n`);
      printUsage();
      return 1;
  }
}

// ---- datum init ----

function cmdInit(args: string[]): number {
  const flags = parseFlags(args);
  const projectDir = flags["project-dir"] || process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const busUrl = flags["bus-url"] || process.env.DATUM_BUS_URL || DEFAULT_BUS_URL;
  const result = init({
    projectDir,
    busUrl,
    human: flags.human || process.env.DATUM_HUMAN,
    branch: flags.branch || process.env.DATUM_BRANCH,
    claimFiles: flags.files ? flags.files.split(",").map((s) => s.trim()).filter(Boolean) : undefined,
    claimSymbols: flags.symbols ? flags.symbols.split(",").map((s) => s.trim()).filter(Boolean) : undefined,
  });

  console.log("datum: wired Claude Code coordination:");
  for (const w of result.wired) console.log(`  - ${w}`);
  console.log(`  settings: ${result.settingsPath}`);
  console.log(`  state:    ${result.statePath} (bus ${result.state.bus_url})`);
  return 0;
}

// ---- datum decide "..." ----

async function cmdDecide(args: string[]): Promise<number> {
  const flags = parseFlags(args);
  const description = flags._positional.join(" ").trim();
  if (!description) {
    console.error('datum decide: needs a decision, e.g. datum decide "use SSE for the tower"');
    return 1;
  }
  const busUrl = flags["bus-url"] || process.env.DATUM_BUS_URL || DEFAULT_BUS_URL;
  const author = flags.author || process.env.DATUM_HUMAN || readHumanFromState() || "";
  const contract = flags.contract;

  try {
    const res = await fetch(`${busUrl}/decide`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ author, description, contract }),
    });
    if (!res.ok) {
      console.error(`datum decide: bus returned ${res.status}`);
      return 1;
    }
    const body = (await res.json()) as { ledger_id?: number; registry_version?: number };
    console.log(
      `datum: recorded decision #${body.ledger_id} (registry v${body.registry_version}, epoch-neutral).`,
    );
    return 0;
  } catch (err) {
    console.error(`datum decide: could not reach bus at ${busUrl} (${errMsg(err)}).`);
    return 1;
  }
}

// ---- datum demo ----

async function cmdDemo(args: string[]): Promise<number> {
  const demoPath = join(PROJECT_ROOT, "demo", "datum-demo.ts");
  if (existsSync(demoPath)) {
    const { spawnSync } = await import("node:child_process");
    const r = spawnSync(process.execPath, [demoPath, ...args], { stdio: "inherit" });
    return r.status ?? 0;
  }
  console.log(
    "datum demo: the demo runner (demo/datum-demo.ts) isn't present yet.\n" +
      "Start the bus with `node server/index.ts`, run `datum init`, then open a\n" +
      "Claude Code session to watch the registry sync live.",
  );
  return 0;
}

// ---- arg parsing (minimal) ----

type Flags = { [k: string]: string } & { _positional: string[] };

function parseFlags(args: string[]): Flags {
  const flags: Flags = { _positional: [] };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a.startsWith("--")) {
      const eq = a.indexOf("=");
      if (eq !== -1) {
        flags[a.slice(2, eq)] = a.slice(eq + 1);
      } else {
        const next = args[i + 1];
        if (next != null && !next.startsWith("--")) {
          flags[a.slice(2)] = next;
          i++;
        } else {
          flags[a.slice(2)] = "true";
        }
      }
    } else {
      flags._positional.push(a);
    }
  }
  return flags;
}

function readHumanFromState(): string | undefined {
  try {
    const path = join(process.env.CLAUDE_PROJECT_DIR || process.cwd(), ".datum", "state.json");
    const state = JSON.parse(readFileSync(path, "utf8")) as { human?: string };
    return state.human;
  } catch {
    return undefined;
  }
}

function printUsage(): void {
  console.log(
    [
      "datum — the real-time coordination layer for teams of Claude Code agents.",
      "",
      "Usage:",
      "  datum init [--human NAME] [--branch B] [--files a,b] [--symbols x,y] [--bus-url URL]",
      "  datum decide \"<decision>\" [--author NAME] [--contract ID] [--bus-url URL]",
      "  datum demo",
      "",
      `Bus URL defaults to ${DEFAULT_BUS_URL} (override with DATUM_BUS_URL).`,
    ].join("\n"),
  );
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

main(process.argv.slice(2))
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error(`datum: ${errMsg(err)}`);
    process.exit(1);
  });
