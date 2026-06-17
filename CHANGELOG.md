# Changelog

All notable changes to Datum are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

Professionalization work in progress: turning Datum into a credible open-core
devtool a stranger can land on, trust, and contribute to.

### Added

- Open-source community documentation: `CONTRIBUTING.md`, `SECURITY.md`, and
  `CODE_OF_CONDUCT.md`.
- This `CHANGELOG.md`, following Keep a Changelog with semantic versioning.
- GitHub issue and pull request templates.
- GitHub Actions CI that runs the test suite and the headless demo as merge gates
  (Node 24, the development and CI baseline).
- `docs/ROADMAP.md`, the north-star document defining the product vision, the
  open-core boundary (MIT core versus Datum Cloud), the target Cloudflare
  architecture, and the sequenced sub-projects.

### Changed

- Rewrote `README.md` and `CLAUDE.md` as product documentation rather than
  build notes, with the positioning, the install path, and the
  detect/protect/judge architecture front and center.

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

[Unreleased]: https://github.com/suraj-phanindra/datum/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/suraj-phanindra/datum/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/suraj-phanindra/datum/releases/tag/v0.1.0
