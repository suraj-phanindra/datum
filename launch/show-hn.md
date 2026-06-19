# Show HN post

## Title options

1. Show HN: Datum - keep your teammates' AI agents from building on contracts that changed
2. Show HN: Datum - a fence that blocks an AI agent's write when a contract drifted
3. Show HN: Datum - real-time coordination for teams running Claude Code agents in parallel

## Body

Hi HN. I'm Suraj. My team builds with Claude Code, and lately we each run an agent against the same repo at the same time. We do spec-driven development by the book: a shared spec, a common CLAUDE.md, PRDs split per engineer. It works right up until implementation starts and the truth changes.

Here is the failure we kept hitting. One engineer's agent renames a database column, swaps a dependency, or changes an API shape. Everyone else's agent keeps building against the old contract, because a spec is a snapshot and nobody re-reads it mid-flight. The drift is invisible until merge, and by then the rework is already paid for. Git coordinates code at rest. Nothing was coordinating the agents in motion.

Datum is our attempt at that missing layer. It gives every agent on the team a live, versioned source of truth, and it catches the drift at the next write instead of at merge.

How it works, in three parts. The first two are deterministic and have no model in the path.

Detect. A PostToolUse hook streams every edit to a shared bus. A path-and-parser watchlist flags the changes that touch a real contract (schema files, route files, dependency manifests, explicit decisions) and bumps a monotonic registry version in milliseconds.

Protect. This is the part I actually care about. A PreToolUse hook is a fence: on every tool call it does a version check plus a set intersection against the changed contracts. If a write targets something that drifted, the write is denied before it executes, with a reason that names the contract, the change, and the author. In our demo it reads:

  db.users.email was renamed to contact_email (migration 0042, asha, 40s ago).
  This edit selects .email and will break. Re-sync to v8 and use contact_email.

The agent reads that reason and self-corrects on its next action. Two things matter here. The deny is evaluated ahead of any permission check, so it holds even under --dangerously-skip-permissions. And it fails open: if the bus is unreachable, the write goes through with a warning rather than bricking your agent.

Judge. Behind the fence, off the critical path, an arbiter (Opus 4.8, async) writes a per-recipient advisory tailored to each teammate's in-flight task and opens a pull request that patches the spec. The arbiter is model-agnostic and the fence works fine with it disabled, so the model is never a latency dependency.

I want to be honest about the one real constraint. Hooks are event-driven, not push. You cannot interrupt an agent mid-generation; the coordination context lands at the next hook event. We think that is fine, because harm only happens at a write, every write is a tool call, and every tool call is an interception point. The guarantee is "no write executes against a stale contract," not "agents are telepathic."

What works today: the fence (a genuine deny on a real version mismatch), the edit streaming, the session-start sync, the arbiter producing two distinct per-recipient advisories, and the spec PR. There is a Claude Code plugin that wires the four hooks, an MCP server, and five skills, and it is zero-init: it self-seeds identity from your git config on the first session. The team model is git-native, the team is the repo, so there is no login and no member list to maintain.

What is early or still rough: the registry parser handles a few contract types well (DB schema, API shape, dependency version, free-form decisions) and is deliberately shallow beyond that. The non-DB watchlist parsers are the next thing to harden. The web "tower" is read-only observability; delete it and the fence still fires. Anything past Claude Code is unproven, though the protocol is agent-agnostic by design.

On the model. It is open core, MIT. The core is the whole protocol: CLI, hooks, MCP server, the single-team self-hosted bus plus registry plus fence, the arbiter (bring your own Anthropic key), the git-native team layer, and the skills. The core is never crippled, and a team can self-host all of it for free, forever. A hosted Datum Cloud is coming for the convenience and collaboration a single team cannot self-host: a hosted multi-tenant bus, multiple workspaces, a management dashboard, a pooled arbiter where we pay the model cost, SSO, retention, audit, and analytics. We monetize we-run-it, multi-team, and we-pay-for-the-model, never a paywalled brain.

Try it. The fastest path is one command that runs the whole scenario end to end (three agents build one feature, one renames users.email, a stale teammate write gets fenced and self-corrects):

  npm run demo

Then watch it live in the tower:

  npm run web        # read-only tower at http://127.0.0.1:4318

Or install the coordination hooks into your own Claude Code:

  /plugin marketplace add suraj-phanindra/datum
  /plugin install datum@datum

Links:
- Repo: https://github.com/suraj-phanindra/datum
- npm: https://www.npmjs.com/package/datumctl
- Tower (hosted, read-only): https://datum-tower.pages.dev (or http://127.0.0.1:4318 after npm run web)
- Site: https://datum-site-eight.vercel.app

I'd genuinely like to hear where this breaks for your setup, especially from teams running more than one agent on a repo at once, and what other contract types you'd want the watchlist to catch. Thanks for reading.
