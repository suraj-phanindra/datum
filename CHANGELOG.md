# Changelog

All notable changes to Datum are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.3.1] - 2026-06-18

### Changed

- Point the package `homepage` at the Datum site
  (https://datum-site-eight.vercel.app/).

## [0.3.0] - 2026-06-17

The Claude Code plugin, the open-core professionalization, and Datum Cloud: the
hosted, multi-tenant backend on Cloudflare.

### Added

- A `datum` command alias. The package still publishes as `datumctl`; both
  invocations now work.
- A Claude Code plugin as the recommended install for Claude Code users
  (`/plugin marketplace add suraj-phanindra/datum` then
  `/plugin install datum@datum`). It bundles the four hooks (`datum-join`,
  `datum-claim`, `datum-fence`, `datum-guard`), the MCP server, and five skills
  (`coordinate`, `claim`, `sync`, `resolve-fence`, `decide`) so agents use Datum
  natively with no separate `datumctl init`.
- Three MCP tools (`datum_claim`, `datum_sync`, `datum_sessions`) so agents can
  publish an intent manifest, review advisories and deltas since their last
  sync, and see the live fleet, all from the session.
- `datum login` and cloud mode: authenticate the CLI and hooks against a hosted
  bus with a bearer token kept in local, gitignored state (never committed).
- Zero-init self-seeding in the `datum-join` hook: when local state is missing or
  incomplete, it seeds git-native identity (human, email, branch, and workspace
  from git config, bus url from the committed `datum.json`) before registering
  the session, so the plugin needs no separate `datumctl init`. The seed is
  fail-soft and idempotent.
- Datum Cloud, the hosted multi-tenant backend (in `cloud/`, its own package so
  the OSS core stays zero-dependency): a per-workspace `WorkspaceBus` Durable
  Object, a Worker router with GitHub-OAuth sessions and D1-backed bearer API
  tokens, a D1 account plane, an async arbiter Queue, and a GitHub App for spec
  PRs. CSWSH-hardened WebSocket fan-out.
- Open-source community documentation: `CONTRIBUTING.md`, `SECURITY.md`,
  `CODE_OF_CONDUCT.md`; this `CHANGELOG.md`; GitHub issue and pull request
  templates; GitHub Actions CI (a `test` job and a `cloud` job); and
  `docs/ROADMAP.md`, the north-star document defining the product vision, the
  open-core boundary (MIT core versus Datum Cloud), the target Cloudflare
  architecture, and the sequenced sub-projects.

### Changed

- Rewrote `README.md` and `CLAUDE.md` as product documentation rather than build
  notes, with the positioning, the install path, and the detect/protect/judge
  architecture front and center.
- Introduced a `SqlBackend` abstraction under the `Store` so the same
  coordination core (`Store`, `registry`, `watchlist`, `fence`, `reconcile`,
  `routeBus`) runs on `node:sqlite` (self-hosted) and Durable Object SQLite
  (Cloud) with no forked logic.

## [0.2.0]

The self-hosted git-native team layer, and the first npm publish.

### Added

- Published the CLI to npm as `datumctl` with a real `npx datumctl init`
  install path. The published package has zero runtime dependencies (Node
  built-ins only) and one devDependency (`esbuild`) for bundling the `dist/`
  output.
- Git-native teams ("the team is the repo"): identity is read from git config
  (`user.name` / `user.email`), the workspace id derives from the git remote,
  and a committed `datum.json` shares the bus url and workspace across the team.
  No login for self-hosted use.
- `datum team` command for inspecting the git-native workspace and its members.
- Install-aware hooks: the installer writes the `.claude/settings.json` hooks
  block and the hook scripts so an installed session resolves the bus from local
  state rather than a hardcoded path.
- A seeded long-running bus (`datum serve`) so a real three-session run can point
  multiple Claude Code sessions at one coordination bus.

### Changed

- Tightened the api-shape watchlist so internal handler edits no longer bump the
  registry version; only changes to the public API surface advance the epoch.

### Fixed

- Isolated the demo seed repo in a temporary directory so its git operations no
  longer leak into the parent repository.

## [0.1.0]

The initial release: the coordination core.

### Added

- `datumctl` CLI, the primary product surface, with the full command set
  (`init`, `serve`, `status`, `claim`, `sync`, `check`, `decide`, `registry`,
  `log`, `advisories`, `diff`, `show`, `watch`, `team`, `tower`, `doctor`,
  `version`, `uninstall`, `demo`). Self-documenting, scriptable, and fail-soft:
  exit `0` ok, `1` error, `2` drift detected, never leaking a stack trace to the
  shell.
- The four Claude Code hooks, written into `.claude/hooks/` by the installer:
  `datum-fence` (PreToolUse), `datum-claim` (PostToolUse), `datum-join`
  (SessionStart), and `datum-guard` (Stop, optional).
- The coordination bus and registry substrate, built on Node built-ins
  (`node:sqlite` and `node:http`), with an append-only event log and an SSE
  fan-out for live consumers.
- The deterministic fence: a PreToolUse version check plus a set intersection on
  every tool call that denies a stale write before it executes, with a reason
  naming the contract, the change, and the author so the agent self-corrects on
  its next action. It fails open if the bus is down (never bricks an agent) and
  fires with the arbiter disabled.
- The contract-surface watchlist plus a monotonic registry version: a
  path-and-parser check flags contract-relevant changes (DB schemas, API shapes,
  dependency versions, and recorded decisions) and bumps the version in
  milliseconds, with no model on the critical path.
- The Opus 4.8 arbiter, off the critical path: it computes the intersecting set
  first, then produces a per-recipient advisory tailored to each teammate's
  in-flight task and opens a pull request that patches the spec. It is
  model-agnostic.
- The MCP server exposing the registry, ledger, and coordination state to
  agents.
- The read-only "tower" dashboard (the epoch strip and the animated drift card),
  deployed as a static artifact. Observability only: delete it and the fence
  still fires, advisories still inject, and the spec PR still opens.
- The headless demo (`npm run demo`): a scripted three-session scenario
  ("workspace invites") that drives the full lifecycle (delta detected, write
  fenced, advisories delivered, sessions reconciled, spec PR opened) end to end.
- Repository scaffold: TypeScript throughout (Node built-ins only, explicit
  `.ts` extensions on relative imports, async/await), `node --test` suites, and
  an esbuild build (`scripts/build.mjs` to `dist/`).

[Unreleased]: https://github.com/suraj-phanindra/datum/compare/v0.3.1...HEAD
[0.3.1]: https://github.com/suraj-phanindra/datum/compare/v0.3.0...v0.3.1
[0.3.0]: https://github.com/suraj-phanindra/datum/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/suraj-phanindra/datum/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/suraj-phanindra/datum/releases/tag/v0.1.0
