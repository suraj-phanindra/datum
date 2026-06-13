## datum CLI — the cockpit (real-devtools surface)

The terminal is the cockpit (design context §1), so the `datum` CLI is the **primary** product surface, not a helper. It must feel like `git`/`gh`: fast, scriptable, fail-soft, self-documenting. Codes against [`schema.md`](./schema.md) §4 (bus HTTP API) + §8 (`.datum/state.json`). Zero install (Node built-ins + `fetch`).

### Architecture (refactor the existing router into a registry)
- `cli/datum.ts` — entry + router. Parses argv + global flags, dispatches to a `COMMANDS` registry, prints global + per-command help. Preserve current `init`/`decide`/`demo` behavior.
- `cli/commands/<name>.ts` — one module per command: `{ name, aliases?, summary, usage, args?, run(ctx): Promise<number> }`. `run` returns the exit code.
- `cli/commands/index.ts` — aggregates the registry (the one file that lists commands).
- `cli/lib/client.ts` — bus client over §4: `version()`, `registry()`, `deltas(since)`, `sessions()`, `advisories(id)`, `decide()`, `events()`, `health()`, `stream(onEvent)` (SSE). All fail-soft (return `{ ok:false, error }`, never throw).
- `cli/lib/state.ts` — read/write `.datum/state.json` + settings.json helpers.
- `cli/lib/format.ts` — ANSI per the strict color discipline (amber=contract/epoch, red=fence/breaking, blue=advisory, green=synced/reconciled, gray=ambient; identifiers in a steady mono style). The `⌖` mark. Auto-disable ANSI when `!isTTY` or `NO_COLOR`/`--no-color`. A `--json` path emits machine-readable JSON instead of styled text. Table/row/chip/epoch-strip helpers.

### Global flags + conventions
`--bus-url URL` (env `DATUM_BUS_URL`), `--json` (machine output), `--no-color`, `-h/--help`, `-v/--version`. **Exit codes:** `0` ok, `1` error, **`2` drift detected** (so `datum check && <write>` composes in scripts/CI). Fail-soft: bus unreachable → show the local-cache view (from `.datum/state.json`) + a one-line warning, never a stack trace.

### Commands
**Lifecycle / meta**
- `datum` (no args) → `status` if `.datum/state.json` exists, else `help`.
- `datum help [command]`, `--help`, `-h` → global usage (grouped) or per-command help.
- `datum version`, `--version`, `-v` → version + node + bus URL.
- `datum init [--human --branch --files --symbols --bus-url]` → wire hooks/MCP/state (exists).
- `datum doctor` → diagnostic checklist (✓/✗ + remediation): Node ≥ 22.6; `.datum/state.json` present + valid; `.claude/settings.json` has the 3 hooks (SessionStart/PostToolUse/PreToolUse) + `mcpServers.datum`; bus reachable (`/healthz` + `/version`); sync state (synced vs behind). Exit 2 if behind, 1 if a critical wiring/bus issue, 0 if healthy.
- `datum uninstall` → remove the datum hooks block from settings.json + `.datum/` (reversible install; confirm unless `--yes`).

**Cockpit (daily driver)**
- `datum status` → header (`⌖ datum · <workspace>`), epoch strip (…vN live), **your** sync state (synced to vN / off datum by M epochs), your claim (files+symbols), live sessions + presence, recent deltas, pending advisories for you. `--json`.
- `datum sync` → pull `/registry` + `/deltas?since`, advance `last_synced_version` (PATCH /sessions/:id + write-back), print what changed since you last synced. This is the "re-sync to v8" the fence deny tells you to run.
- `datum claim [globs…] [--symbols x,y] [--add]` → set/extend your claimed scope (PATCH /sessions/:id); with no args, print the current claim.
- `datum advisories [--watch]` → the per-recipient advisories addressed to you (severity-colored). `--json`.
- `datum check [path] [--content -]` → **dry-run the fence**: would an edit to `path` (reads stdin with `--content -`, else scans your claim) be fenced against fresh deltas? Prints allow/inject/deny + the stale symbol + the deny reason. Exit `2` on deny (composes: `datum check routes/users.ts && $EDITOR`).
- `datum watch` → live-tail bus events (SSE), color-coded by `type` (delta=amber, fenced=red, advisory=blue, reconciled=green). `tail -f` for coordination.

**Truth / history**
- `datum registry` (alias `truth`) → contracts + versions + presence avatars (initials). `--json`.
- `datum show <contract>` → one contract: current value, version history (who/when/why per epoch), who is building against it. e.g. `datum show db.users`.
- `datum diff <contract> [vN vM]` → mechanical diff between two versions (default: previous→current).
- `datum log` (alias `ledger`) → decision history `#id  ts  author · description` (like `git log`). `--limit N`, `--json`.
- `datum decide "<text>" [--contract ID]` → record a free-form decision (epoch-neutral) (exists).

**Ops / servers**
- `datum serve [--port N]` (alias `bus`) → start the bus + registry + arbiter (`server/index.ts`).
- `datum tower [--port N] [--open]` → start the read-only web tower (`web/serve.ts`).
- `datum demo` → the scripted workspace-invites scenario (exists).

### Acceptance test
`test/cli.test.ts`: against an ephemeral seeded bus (epoch 8) + a tmp `.datum/state.json`, drive the router and assert: `help`/`--help` lists the grouped commands and exits 0; `version` prints a version; `status` (text + `--json`) shows epoch 8 and the sync state; `registry --json` lists db.users v8; `log --json` shows ledger #112/#111/#110; `show db.users` includes the rename history; `check` on a `.email` write while behind → exit 2 + a deny reason naming contract/change/author; `doctor` reports the wired hooks + reachable bus (exit 0) and exit 2 when behind; `decide` records epoch-neutral; unknown command → usage + exit 1; bus-down → fail-soft (no stack trace, local view). `--no-color`/non-TTY emits no ANSI.

### Files
`cli/datum.ts` (router), `cli/commands/{index,help,version,init,doctor,uninstall,status,sync,claim,advisories,check,watch,registry,show,diff,log,decide,serve,tower,demo}.ts`, `cli/lib/{client,state,format}.ts`, `test/cli.test.ts`.

### Company-grade roadmap (noted, not all built day-one)
Auth + multi-workspace (`datum login`, `datum workspaces`), `datum replay` (time-scrub a past window), `datum metrics` (rework-avoided/delta-to-fence), shell completions (`datum completion zsh`), `datum mcp` (run/inspect the MCP server), update-notifier, and `--agent` machine output for non-Claude harnesses. The registry/event protocol is agent-agnostic, so Cursor/Codex adapters are a thin client over the same bus.
