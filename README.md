# ⌖ datum

**The real-time coordination layer for teams of developers running Claude Code agents.**

> git coordinates code at rest; datum coordinates agents in motion.

A team does spec-driven development right — shared spec, common CLAUDE.md, PRDs split per engineer — then implementation starts and truth changes. One agent renames a column or swaps a dependency, and the others keep building against a contract that no longer exists. The drift surfaces at merge, after the rework is paid for. datum is the live source of truth that catches it at the next write instead.

## How it works

A deterministic fast path and a model slow path:

- **Detect (fast, no model).** A `PostToolUse` hook streams every edit to a shared bus. A path-and-parser **watchlist** flags contract-relevant changes and bumps a monotonic registry version in milliseconds.
- **Protect (fast, no model).** A `PreToolUse` **fence** runs a version check + set intersection on every tool call. A stale write that targets a changed contract is **denied** before it executes, with a reason naming the contract, the change, and the author — the agent self-corrects on its next action.
- **Judge (slow, async, Opus 4.8).** An arbiter off the critical path decides which changes break whom, writes a **per-recipient advisory** tailored to each teammate's in-flight task, and opens a **PR that patches the spec**.

The model is never on the critical path: the fence fires with the arbiter disabled.

## Layout

```
datum/
  CLAUDE.md            master context
  SUMMARY.md           proof-of-understanding brief
  docs/                BUILD_PLAN.md, RUBRIC.md, design files
  server/              bus + registry + watchlist parser + arbiter queue + MCP server
  cli/                 npx datum init  (writes hooks block + scripts, registers MCP)
  hooks/               datum-fence.ts, datum-claim.ts, datum-join.ts, datum-guard.ts
  web/                 the tower (epoch strip + drift card, real + animated)
  demo/                workspace-invites seed repo, scripted emitter, `datum demo`
  test/                unit suites (watchlist, version bump, fence, advisory)
  datum Design System/ the Claude Design export (tokens + components)
```

## Develop

```bash
npm test          # node --test over TypeScript, no build step
npm run server    # start the bus + registry + arbiter queue
npm run demo      # headless workspace-invites scenario (RUBRIC gate)
npm run web       # serve the tower
```

Requires Node ≥ 22.6 (TypeScript runs via native type-stripping). The arbiter uses
`claude-opus-4-8` via `ANTHROPIC_API_KEY` when set, else the authenticated `claude` CLI.

See `docs/BUILD_PLAN.md` for the build sequence and `docs/RUBRIC.md` for the definition of done.
