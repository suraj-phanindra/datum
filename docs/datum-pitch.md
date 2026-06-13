# Datum

**The real-time coordination layer for teams of developers running AI coding agents.**

Git coordinates code at rest. Datum coordinates agents in motion.

---

## The Problem

Every engineer is becoming an orchestrator. On our team of four, each of us runs Claude Code agents and subagents in parallel against the same feature. We do everything right: spec-driven development, a shared CLAUDE.md, PRDs split per engineer. Then implementation starts and truth changes. One person's agent swaps a DB driver or renames a column, and three other people's agents keep building against a contract that no longer exists. The drift surfaces at merge time, after the rework cost is already paid.

Specs, CLAUDE.md, and PRDs are snapshots. Agents in flight need a live source of truth, and today there is none. Teams burn hours and millions of tokens rediscovering, at merge, what one agent decided at 2 PM.

## The Product

Datum is a thin layer that sits between a team's running agents. Three primitives:

1. **Contract registry + decision ledger.** A live, versioned source of truth: DB schemas, API shapes, dependency versions, and free-form decisions, each entry stamped with who, when, and why.
2. **Hooks, not suggestions.** A one-command install wires Claude Code hooks on each engineer's machine. Every edit and command streams to the bus; every tool call is fenced against the registry version before it executes. Coordination becomes a checkpoint the agent cannot ignore, unlike a stale markdown file it can.
3. **A model arbiter off the critical path.** Correctness is deterministic and instant: contract-surface watchlists detect drift in milliseconds, and consumer-side version fencing blocks stale writes at the next tool call. Claude (Fable 5) then layers judgment on top: deciding which changes break whom via scoped intent manifests, rewriting advisories in terms of each teammate's current task, and patching the spec so it stays living. Advisories land in seconds; the SLO is beating the next relevant write, not milliseconds.

## Why Now

Anthropic just shipped Agent Teams: coordinated agent fleets for a single orchestrator, with shared task lists and file locks. The single-player problem is solved natively. The multiplayer problem is wide open. Memory layers (Mem0, Cloudflare Agent Memory) share durable knowledge asynchronously, but none model in-flight work state. Augment's Cosmos attacks coordination by owning the whole stack. Nobody has built the thin, tool-agnostic layer for the tools teams already use.

Every prior shift in how code is written produced a coordination company. Concurrent editing produced version control. Distributed teams produced GitHub. Agent fleets per engineer is the next shift, and coordination is already its bottleneck.

## Where This Goes

Claude Code teams are the wedge: hooks make integration zero-friction and the pain is acute today. The contract registry and event protocol are agent-agnostic, so Cursor, Codex, and custom harnesses follow. End state: Datum is the control plane every agent on a team reads before it writes, priced per seat like the infrastructure it replaces meetings with.

## Why Us

We live this problem daily on a four-engineer team. We previously built Atrium (atrium.fly.dev) at the "Built with Opus 4.6" hackathon: a technical interview platform with three coordinated Opus agents, real-time swim-lane observability of agent activity, and AI rubric evaluation. Datum is the team-scale sequel, and the hardest half of its surface, live multi-agent observability, has already shipped once.

## Status

Built and demoed at the Claude Fable 5 Build Day (June 2026): three Claude Code sessions building one feature on one repo. One agent migrates the schema mid-build; the other two self-correct before their next edit; three branches merge clean; the arbiter opens the spec-update PR.
