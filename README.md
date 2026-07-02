# ⌖ datum

**Coordination for teams of AI coding agents. The fence blocks a stale write before it executes.**

> Git coordinates code at rest. Datum coordinates agents in motion.

[![npm version](https://img.shields.io/npm/v/datumctl.svg)](https://www.npmjs.com/package/datumctl)
[![license: MIT](https://img.shields.io/github/license/suraj-phanindra/datum.svg)](LICENSE)
[![CI](https://img.shields.io/github/actions/workflow/status/suraj-phanindra/datum/ci.yml?branch=main)](https://github.com/suraj-phanindra/datum/actions)

Datum is a real-time coordination layer for teams whose engineers each run an AI coding agent (such as Claude Code) against the same repo. When one agent renames a database column, swaps a dependency, or changes an API shape, Datum catches the drift at the next write instead of at merge, by giving every agent in flight a live, versioned source of truth it cannot ignore.

## See it work

One command runs the full scenario end to end: three agents build one feature, one renames `users.email` to `contact_email`, and a stale write from a teammate gets fenced and self-corrects.

```bash
npm run demo
```

Then watch it live in the tower ([hosted, read-only](https://datum-tower.pages.dev), or run your own), and install the coordination hooks into your own Claude Code in one step:

```bash
npm run web                              # the read-only "tower" at http://127.0.0.1:4318
```

```
/plugin marketplace add suraj-phanindra/datum
/plugin install datum@datum
```

## The problem

Teams do spec-driven development right: a shared spec, a common `CLAUDE.md`, PRDs split per engineer. Then implementation starts and truth changes. One agent renames a column; the others keep building against a contract that no longer exists. The drift surfaces at merge, after the rework is already paid for. Specs are snapshots; agents in flight have no live source of truth.

## How it works

A deterministic fast path, with the model on a slow path behind it.

**Detect** (fast, no model). A `PostToolUse` hook streams every edit to a shared bus. A path-and-parser **watchlist** flags contract-relevant changes and bumps a monotonic registry version in milliseconds.

**Protect** (fast, no model). This is the money shot. A `PreToolUse` **fence** runs a version check plus a set intersection on every tool call. A stale write that targets a changed contract is **denied before it executes**, with a reason that names the contract, the change, and the author:

```
db.users.email was renamed to contact_email (migration 0042, asha, 40s ago).
This edit selects .email and will break. Re-sync to v8 and use contact_email.
```

The agent reads that reason and self-corrects on its next action. The deny lands ahead of any permission check, so it holds even under `--dangerously-skip-permissions`. It fails open and never bricks an agent if the bus is down.

**Judge** (slow, async, Opus 4.8). An **arbiter** off the critical path writes a **per-recipient advisory** tailored to each teammate's in-flight task and opens a **pull request that patches the spec**. It is model-agnostic.

The model is never on the critical path: the fence fires with the arbiter disabled.

## Install

### Claude Code plugin (recommended)

```
/plugin marketplace add suraj-phanindra/datum
/plugin install datum@datum
```

The plugin wires everything an agent needs to coordinate natively:

- **The four hooks**: `datum-join` (SessionStart), `datum-claim` (PostToolUse), `datum-fence` (PreToolUse), and `datum-guard` (Stop).
- **The MCP server**, so agents can read the registry and ledger and publish claims, syncs, and decisions.
- **Six skills**, namespaced under `/datum:`, that drive the agent: `setup` configures Datum and starts the bus with zero manual steps, and `coordinate`, `claim`, `sync`, `resolve-fence`, and `decide` teach the coordination loop and drive the MCP tools.

It is **zero-init**: the `datum-join` hook self-seeds git-native identity (human, email, branch, and workspace from your git config) on the first session, so there is no separate `datumctl init` step. Solo users get `http://127.0.0.1:4317` by default; teams get their bus from the committed `datum.json`.

### CLI alternative

If you are not on the plugin path, install the CLI directly:

```bash
npx datumctl init        # wire Claude Code hooks + MCP, seed local state
datumctl serve           # start the coordination bus (point sessions here)
```

Either way, `datumctl serve` runs the coordination bus that sessions point at.

`datumctl` ships as a self-contained npm package with **zero runtime dependencies** (Node built-ins only). The installed hooks need **Node ≥ 18**; the bus (`datumctl serve`) uses `node:sqlite` and needs **Node ≥ 22.5**.

## Teams (self-hosted, git-native)

**The team is the repo.** There is no login and no member list to maintain: membership is having the repo. Identity comes from your git config (`user.name` / `user.email`), and the workspace id derives from the git remote, so every clone of the same repo lands in the **same team automatically**.

```bash
datumctl serve --public          # one shared bus for the team (binds 0.0.0.0, prints a tunnel hint)
datumctl init                    # per engineer; the first init creates the committed datum.json
datumctl team                    # see the live fleet: workspace + bus + roster
```

The committed `datum.json` (repo root) shares the team's `bus_url` and `workspace`; the first `init` creates it, the rest read it. Full git-native model: [`docs/prd/teams.md`](docs/prd/teams.md).

## Open core

The MIT-licensed core is the **whole protocol**: the CLI, the hooks, the MCP server, the single-team bus plus registry plus fence, the arbiter (bring your own Anthropic key), the git-native team layer, and the Claude Code skills. The core is never crippled, and a team can self-host all of it. **Datum Cloud** (premium, per-seat) adds the hosted multi-tenant bus, the team-management dashboard, a pooled arbiter (we pay the model cost), SSO, retention and audit, and analytics.

Datum Cloud is developed in a **separate, private repository** and depends on the published [`datum-core`](https://www.npmjs.com/package/datum-core) package, so the same coordination core runs in both the self-hosted bus and the hosted plane. See [`LICENSING.md`](LICENSING.md) for the open-core boundary and [`docs/ROADMAP.md`](docs/ROADMAP.md) for the full model and architecture.

## Project layout

```
datum/
  cli/                 datumctl entry + commands
  core/                datum-core: the coordination core as a package
  hooks/               datum-fence, datum-claim, datum-join, datum-guard
  plugin/              the Claude Code plugin (hooks + MCP + skills)
  server/              bus + registry + watchlist + arbiter + MCP server
  web/                 the read-only "tower" dashboard
  demo/                headless scenario (npm run demo)
  test/                node --test suites
  docs/                ROADMAP.md + design + spec
  datum Design System/ design tokens export
```

## Develop

```bash
npm test          # node --test over TypeScript, no build step
npm run build     # bundle via esbuild -> dist/
npm run demo      # headless coordination scenario
npm run web       # serve the tower
```

Requires **Node ≥ 22.6** for source and tests (native TypeScript type-stripping plus `node:sqlite`). Use Node 24 for development and CI. The arbiter uses `claude-opus-4-8` via `ANTHROPIC_API_KEY` when set, else the authenticated `claude` CLI.

## Contributing

Issues and pull requests are welcome. See [`CONTRIBUTING.md`](CONTRIBUTING.md).

## Security

Found a vulnerability? Please follow the disclosure process in [`SECURITY.md`](SECURITY.md).

## License

[MIT](LICENSE).
</content>
</invoke>
