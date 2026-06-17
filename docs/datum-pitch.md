# Datum

**Positioning: the real-time coordination layer for teams of developers running AI coding agents.**

Git coordinates code at rest. Datum coordinates agents in motion.

---

## The Problem

Every engineer is becoming an orchestrator. On a team where each person runs an AI coding agent (such as Claude Code) in parallel against the same repo, the team does spec-driven development right: a shared spec, a common CLAUDE.md, PRDs split per engineer. Then implementation starts and truth changes. One person's agent renames a column, swaps a dependency, or reshapes an API, and the others keep building against a contract that no longer exists. The drift surfaces at merge, after the rework cost is already paid.

Specs, CLAUDE.md, and PRDs are snapshots. Agents in flight need a live source of truth, and today there is none. Teams burn hours and millions of tokens rediscovering, at merge, what one agent decided at 2 PM.

## The Product

Datum is a thin layer that sits between a team's running agents and catches contract drift (a renamed DB column, a swapped dependency, a changed API shape, a recorded decision) at the next write instead of at merge. Install and run it with two commands: `npx datumctl init` wires the Claude Code hooks and MCP server and seeds local state, and `datumctl serve` starts the coordination bus that every session points at. Three primitives:

1. **Contract registry + decision ledger.** A live, versioned source of truth: DB schemas, API shapes, dependency versions, and free-form decisions, each entry stamped with who, when, and why. Append-only, monotonically versioned, and shared across every agent on the team.

2. **Hooks, not suggestions.** The one-command install wires Claude Code hooks on each engineer's machine. A PostToolUse hook streams every edit to the bus; a PreToolUse fence checks every tool call against the current registry version and denies a stale write before it executes, naming the contract, the change, and the author so the agent self-corrects on its next action. Coordination becomes a checkpoint the agent cannot ignore, unlike a stale markdown file it can. The fence is deterministic, runs in milliseconds, and fails open if the bus is down so it never bricks an agent.

3. **A model arbiter off the critical path.** Correctness is deterministic and instant: a path-and-parser watchlist detects drift in milliseconds and bumps a monotonic registry version, and consumer-side version fencing blocks stale writes at the next tool call (the fence fires even with the arbiter disabled). The arbiter, running Opus 4.8 (claude-opus-4-8) asynchronously and off the critical path, then layers judgment on top: deciding which changes break whom via scoped intent manifests, rewriting each advisory in terms of that teammate's in-flight task, and opening a pull request that patches the spec so it stays living. The arbiter is model-agnostic. Advisories land in seconds; the SLO is beating the next relevant write, not milliseconds. The model is never on the critical path.

## Why Now

Anthropic shipped Agent Teams: coordinated agent fleets for a single orchestrator, with shared task lists and file locks. The single-player problem is solved natively. The multiplayer problem is wide open. Memory layers (Mem0, Cloudflare Agent Memory) share durable knowledge asynchronously, but none model in-flight work state. Augment's Cosmos attacks coordination by owning the whole stack. Nobody has built the thin, tool-agnostic layer for the tools teams already use.

Every prior shift in how code is written produced a coordination company. Concurrent editing produced version control. Distributed teams produced GitHub. Agent fleets per engineer is the next shift, and coordination is already its bottleneck.

## Where This Goes

Claude Code teams are the wedge: hooks make integration zero-friction and the pain is acute today. Teams are git-native by design (the team is the repo): identity comes from git config, the workspace id derives from the git remote, and a committed `datum.json` shares the bus url and workspace, so there is no login to self-host. The contract registry and event protocol are agent-agnostic, so Cursor, Codex, and custom harnesses follow. End state: Datum is the control plane every agent on a team reads before it writes, priced per seat like the infrastructure it replaces meetings with.

## Why Us

We live this problem daily. We run AI coding agents in parallel against shared repos, and we felt the merge-time drift tax before we built the fix for it. Datum is the layer we wanted: the hardest part of its surface, live multi-agent coordination that acts on every write, is already shipped and working.

## Open core

Datum is built open-core. The MIT-licensed core is the whole protocol: the `datumctl` CLI, the hooks (fence, claim, join, guard), the MCP server, the single-team bus with registry and watchlist and fence, the arbiter (bring your own Anthropic key), the git-native team layer, and the Claude Code Skills. The core is never crippled; a team can self-host all of it, including the arbiter. Datum Cloud is the premium, per-seat plan: a hosted multi-tenant bus we run for you, a team-management dashboard, a pooled arbiter (we pay the model cost), SSO, retention and audit, and analytics. We monetize convenience and collaboration, never a paywalled brain.

MIT licensed. Source: https://github.com/suraj-phanindra/datum. Full direction in [docs/ROADMAP.md](./ROADMAP.md).
