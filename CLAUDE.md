# CLAUDE.md

Context for working **on** the Datum codebase, for both human contributors and AI
coding agents. Read this first, then `docs/ROADMAP.md` for where the product is
going and `CONTRIBUTING.md` for how to land a change.

## What Datum is

Datum is the real-time coordination layer for teams whose engineers each run AI
coding agents (such as Claude Code) against the same repo. Git coordinates code at
rest; Datum coordinates agents in motion. Teams do spec-driven development right (a
shared spec, a common `CLAUDE.md`, PRDs split per engineer), then implementation
starts and truth changes: one agent renames a DB column, swaps a dependency, or
changes an API shape, and the others keep building against a contract that no longer
exists. Specs are snapshots, so the drift surfaces at merge after the rework is
already paid for. Datum is the live source of truth that catches that drift (a
renamed column, a swapped dependency, a changed API shape, a recorded decision) at
the next write instead of at merge.

## Architecture: the load-bearing principle

Keep the model off the critical path. Correctness comes from a deterministic fast
path; the model adds judgment, not latency. Three stages:

- **Detect (fast, no model).** A PostToolUse hook streams every edit to a shared bus.
  A path-and-parser "watchlist" flags contract-relevant changes (DB schema, API
  shape, dependency version, decision) and bumps a monotonic registry version in
  milliseconds. No model call.
- **Protect (fast, no model).** A PreToolUse "fence" runs a version check plus a set
  intersection on every tool call. If a fresh delta touches files or symbols in this
  session's claimed scope, it denies the stale write before it executes, with a
  reason naming the contract, the change, and the author. The agent self-corrects on
  its next action. **The fence fires with the arbiter disabled**, it is the
  load-bearing guarantee. It **fails open** if the bus is down (it warns, it never
  bricks an agent). The guarantee is "no write executes against a stale contract,"
  not "agents are telepathic": hooks are event-driven, not push, but every write is a
  tool call and every tool call is an interception point.
- **Judge (slow, async, Opus 4.8).** An "arbiter" off the critical path computes the
  intersecting set first, then writes a per-recipient advisory tailored to each
  teammate's in-flight task and opens a pull request that patches the spec. It runs
  server-side via a queue, never in the request path, and it is model-agnostic (a
  one-line swap if a different model is preferred).

Delete the arbiter and the fence still protects the team. Delete the web tower and
the protocol still works. That ordering is deliberate; preserve it.

## Where things live

```
datum/
  cli/                 datumctl entry point + commands (init, serve, decide, ...)
  hooks/               the four hooks: datum-fence, datum-claim, datum-join, datum-guard
  server/              the coordination bus: registry + watchlist parser + fence version + arbiter + MCP server
  web/                 the read-only "tower" dashboard (observability only)
  demo/                headless end-to-end scenario ("npm run demo")
  test/                node --test suites
  scripts/             build.mjs (esbuild bundling to dist/)
  docs/                ROADMAP.md, design brief, and spec
  datum Design System/ design tokens export (source of truth for the tower's look)
```

- **cli/** is the `datumctl` package surface. `datumctl init` wires the Claude Code
  hooks + MCP and seeds local state; `datumctl serve` starts the bus that sessions
  point at.
- **hooks/** are the four hook scripts: `datum-fence` (PreToolUse, the deny), `datum-claim`
  (PostToolUse, the stream), `datum-join` (SessionStart, the sync), `datum-guard`
  (Stop, optional).
- **server/** is the deterministic core (Detect + Protect) plus the async arbiter
  (Judge) and the MCP server. Teams are git-native here: identity comes from git
  config (`user.name` / `user.email`), the workspace id derives from the git remote,
  and a committed `datum.json` shares the bus url + workspace. No login for self-hosted.

## Running it

Use **Node 24** for development and CI. Version requirements vary by surface:

- Installed hooks need **Node >=18**.
- The bus (`datumctl serve`) uses `node:sqlite` and needs **Node >=22.5**.
- Running the source and tests uses native TypeScript type-stripping plus
  `node:sqlite` and needs **Node >=22.6**.

Scripts:

- `npm test`: run the suites (`node --test`).
- `npm run demo`: run the headless end-to-end scenario.
- `npm run server`: start the coordination bus (`node server/index.ts`).
- `npm run web`: serve the read-only tower (`node web/serve.ts`).
- `npm run build`: bundle to `dist/` via esbuild (`node scripts/build.mjs`).
- `npm run typecheck`: `tsc --noEmit`. Note: `tsc` is **not** installed, so this is
  a local-only convenience and is not relied on in CI.

## Conventions

- **TypeScript throughout.** Run the source directly with Node's native
  type-stripping; do not add a build step to the dev loop.
- **Node built-ins only.** The package ships with **zero runtime dependencies** (one
  devDependency, esbuild, for bundling). The zero-dep guarantee is a feature, not an
  accident: it keeps `npx datumctl` instant and the install trustworthy. Adding a
  runtime dependency requires discussion first.
- **Relative imports use explicit `.ts` extensions** (for example
  `import { fence } from "./fence.ts"`). Native type-stripping requires this.
- **Prefer async/await** over raw promise chains and callbacks.
- **The not-a-dashboard discipline.** The product is the protocol, the hooks, and the
  arbiter. The web tower is read-only observability on top: it acts on nothing. The
  litmus test for any change is "delete the dashboard and the product still works."
  Datum acts (denies tool calls), injects (changes agent behavior mid-flight), and
  generates (tailored advisories, spec PRs); the view only reflects that. Build the
  protocol path first and keep it real.

## Open-core boundary

Datum is open core. The MIT-licensed core is the **whole protocol**: the CLI, the
hooks, the MCP server, the single-team bus + registry + fence, the arbiter (with a
bring-your-own Anthropic key), the git-native team layer, and the Claude Code skills.
Datum Cloud (premium, per-seat) adds the hosted multi-tenant bus, the team-management
dashboard, a pooled arbiter (we pay the model cost), SSO, retention / audit, and
analytics. The core is never crippled. Full detail and the build sequence are in
`docs/ROADMAP.md`.

## Contributing

See `CONTRIBUTING.md` for branch, test, and PR conventions. License: MIT.
Repository: https://github.com/suraj-phanindra/datum
