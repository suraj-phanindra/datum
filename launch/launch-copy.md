# Launch copy

## One-liner

Datum is the real-time coordination layer for teams whose engineers each run an AI coding agent against the same repo. Git coordinates code at rest; Datum coordinates agents in motion, and the fence blocks a stale write before it executes.

## X / Twitter thread

**1/**
We run Claude Code agents in parallel against the same repo. The problem nobody warns you about: one agent renames a column, the others keep building on a contract that no longer exists, and you only find out at merge.

So we built Datum. Open source, MIT. ⌖

**2/**
Git coordinates code at rest. Nothing was coordinating the agents in motion.

A spec is a snapshot. Agents in flight have no live source of truth, so drift is invisible until the rework is already paid for.

**3/**
Datum catches drift at the next write, not at merge.

Detect: a hook streams every edit to a shared bus and bumps a versioned registry of contracts (schemas, API shapes, deps, decisions). No model, milliseconds.

**4/**
Protect: a PreToolUse fence checks every tool call against the changed contracts. A stale write is denied before it runs, with the reason:

"users.email was renamed to contact_email (migration 0042, asha, 40s ago). This edit selects .email and will break."

The agent reads that and self-corrects.

**5/**
The deny lands ahead of any permission check, so it holds even under --dangerously-skip-permissions. It fails open if the bus is down. Behind it, an Opus 4.8 arbiter writes per-teammate advisories and opens a PR that patches the spec, off the critical path.

**6/**
Open core, MIT. The whole protocol is free and self-hostable: CLI, hooks, MCP server, bus, registry, fence, arbiter (BYO key). Hosted Cloud coming for the multi-team convenience you can't self-host.

One command runs the whole thing:
npm run demo
https://github.com/suraj-phanindra/datum

## LinkedIn blurb

Every engineer is becoming an orchestrator. On my team we each run an AI coding agent against the same repo, and we kept hitting the same wall: one agent renames a database column or changes an API shape, every other agent keeps building against the contract that just disappeared, and the drift only surfaces at merge once the rework is already paid for.

Git coordinates code at rest. Nothing was coordinating the agents in motion, so we built that layer. It's called Datum, and it's open source under MIT.

Datum gives every agent on the team a live, versioned source of truth and catches drift at the next write instead of at merge. A deterministic fence checks each tool call against the contracts that changed and denies a stale write before it executes, naming the contract, the change, and the author so the agent self-corrects. Behind the fence, an Opus 4.8 arbiter writes a tailored advisory for each teammate's current task and opens a pull request that patches the spec, all off the critical path so the model never adds latency.

The core is the whole protocol and it's free and self-hostable forever. A hosted Datum Cloud is coming for the multi-team convenience a single team can't run itself. If your team runs more than one coding agent on a repo at once, I'd love your feedback.

Repo: https://github.com/suraj-phanindra/datum
