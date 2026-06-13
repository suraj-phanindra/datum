# CLAUDE.md

Master context for building Datum. Read this first, then docs/BUILD_PLAN.md (the sequence) and docs/RUBRIC.md (what "done" means and how to verify it). The design files listed at the bottom are the source of truth for look and behavior.

## First steps for this session

1. Confirm Opus 4.8 API access with one cheap call before anything else (model string: claude-opus-4-8). Fable 5 and Mythos 5 are suspended under a government directive as of June 12 2026; all other models including Opus 4.8 are unaffected. The arbiter is model-agnostic, so if Fable 5 returns it can swap with a one-line change.
2. Confirm the exact Claude Code hook JSON schema against the current reference at docs.claude.com/en/docs/claude-code/hooks before wiring the hooks. The contracts below are correct in shape; verify field names have not changed.
3. Scaffold the repo (suggested layout below), agree the event schema and data model with the team, and seed the demo workspace.
4. Build in BUILD_PLAN order. Verify against RUBRIC continuously. The headless `datum demo` script in the rubric is the model-gradable check; make it pass.

## What Datum is

The real-time coordination layer for teams of developers who each run Claude Code agents against the same feature. Git coordinates code at rest; Datum coordinates agents in motion.

The problem: a team does spec-driven development right (shared spec, common CLAUDE.md, PRDs split per engineer), then implementation starts and truth changes. One agent renames a column or swaps a dependency, and the other agents keep building against a contract that no longer exists. The drift surfaces at merge, after the rework is paid for. Specs and CLAUDE.md are snapshots; agents in flight have no live source of truth.

## What we are building this session (MVP scope)

A thin coordination layer with three primitives, demoed end to end with three Claude Code sessions building one feature on one repo. Resist anything outside this:

1. Contract registry + decision ledger. A live, versioned source of truth: DB schemas, API shapes, dependency versions, and free-form decisions, each entry stamped with who, when, why. Append-only.
2. Hooks, not suggestions. One install command writes Claude Code hooks on each engineer's machine. Every edit streams to a shared bus; every tool call is fenced against the registry version before it executes. Coordination becomes a checkpoint the agent cannot ignore.
3. A model arbiter off the critical path. Correctness is deterministic and instant. Opus 4.8 layers judgment on top: deciding which changes break whom, rewriting advisories per teammate's current task, and opening a PR that patches the spec.

## Architecture: the load-bearing principle

Keep the model off the critical path. Correctness comes from a deterministic fast path; the model adds judgment, not latency.

- Detection is nearly free. Contract surfaces are a known watchlist. The PostToolUse hook streams every edit to the bus, where a path-and-parser check flags contract-relevant changes in milliseconds and bumps a monotonic registry version. No model call.
- Protection is consumer-side and instant. Each session tracks the registry version it last synced. The PreToolUse hook does a version check plus a set intersection on each tool call: does any fresh delta touch files or symbols in my claimed scope? If yes, inject the raw mechanical delta, or deny the write if it directly violates the new contract. Stale writes get fenced even if the arbiter never runs.
- The model reasons scoped, not global. Each session publishes a compact intent manifest (PRD slice, claimed files, touched symbols). "Which changes break whom" is computed as a set intersection first; the model only sees intersecting pairs (the delta plus that teammate's manifest) on a cached prefix.
- The slow judgment is async: conflicting changes from two devs, or writing the spec patch. Latency does not matter there.
- SLO is not milliseconds. It is beating the consumer's next relevant write. Tool-call boundaries give an interception point every few seconds.
- Keep the fence check under ~50ms: cache the registry version locally, long-poll for bumps, only do the HTTP roundtrip on a version mismatch. Fail open with a dashboard warning if the bus is down. Never brick an agent.

## The hooks (verified capabilities, confirm field names against docs)

Three hook files for the MVP, written into `.claude/hooks/` by the installer, plus one stretch hook.

PreToolUse, `.claude/hooks/datum-fence.ts` (the fence)
- Input on stdin (JSON): session_id, cwd, hook_event_name, tool_name, tool_input.
- Logic: read locally cached last-synced version; check the bus for the current version (long-poll, HTTP only on mismatch); if a fresh delta's touched files or symbols intersect this write's target, either inject the mechanical delta or deny the write when it directly conflicts.
- Output on stdout (JSON), deny case:
  ```json
  {
    "hookSpecificOutput": {
      "hookEventName": "PreToolUse",
      "permissionDecision": "deny",
      "permissionDecisionReason": "db.users.email was renamed to contact_email (migration 0042, asha, 40s ago). This edit selects .email and will break. Re-sync to v8 and use contact_email."
    }
  }
  ```
- permissionDecision is allow, deny, or ask, with permissionDecisionReason. A deny blocks the tool and feeds the reason back to the agent, which then self-corrects. The deny is evaluated before any permission-mode check, so it holds even under bypassPermissions or --dangerously-skip-permissions. This is the strongest control surface available and it is the demo's money shot.
- v2 only (do not demo, mention as "what's next"): PreToolUse can return updatedInput to rewrite the tool arguments before execution, silently fixing the stale column name. The visible deny-and-self-correct is more legible, so ship that.

PostToolUse, `.claude/hooks/datum-claim.ts` (publish claim and activity)
- Input: session_id, cwd, tool_name, tool_input, tool_response.
- Logic: stream the edit to the bus. If the edited path is on the contract-surface watchlist, the server parses it and bumps the registry version. Publish the session's claim and current activity.
- Can append additionalContext to the tool result to confirm sync state.

SessionStart, `.claude/hooks/datum-join.ts` (register and sync)
- Input: session_id, cwd, source.
- Logic: register the session on the workspace (branch, claim), pull the current registry snapshot, inject it as additionalContext so the agent starts on the latest truth. SessionStart and UserPromptSubmit inject additionalContext into the model's context.

Stop, `.claude/hooks/datum-guard.ts` (stretch)
- A Stop hook that exits 2 forces the agent to keep working. Use it so no agent declares itself done while unacknowledged deltas intersect its diff.

Honest constraint to keep in mind and state in the demo: hooks are event-driven, not push. You cannot interrupt mid-generation; context lands at the next hook event. This is fine because harm only happens at writes, every write is a tool call, and every tool call is an interception point. The guarantee is "no write executes against a stale contract," not "agents are telepathic."

## Data model

Tables (SQLite via better-sqlite3 is simplest; Mongo is fine if the team prefers):

- contracts: id, name, type (db_schema | api_shape | dep_version | decision), current_version (monotonic int), current_value.
- contract_versions: contract_id, version, author, ts, why, mechanical_change, value_snapshot.
- ledger: id (auto-increment), ts, author, description. Append-only.
- sessions: id, human, branch, claim_files (json), claim_symbols (json), last_synced_version, status.
- events: id, type, payload (json), ts. The append-only bus log.

Event types on the bus: session.joined, claim.published, edit.streamed, delta.detected, write.fenced, advisory.delivered, reconciled (per session, plus a workspace-level reconciled when all consumers are done), spec.pr.opened.

## Contract-surface watchlist (path plus parser)

- db schema: *.prisma, schema.sql, migrations/**, drizzle schema, models/**.
- api shape: routes/**, *.controller.ts, openapi.*, trpc routers.
- dep version: package.json, requirements.txt, go.mod, Cargo.toml (version changes only).
- decision: an explicit `datum decide "..."` command, or an append to DECISIONS.md.

A path match plus a light parse (which symbol or column or version changed) is enough. Do not over-engineer the parser; two or three contract types carry the demo.

## The arbiter (Opus 4.8, off the critical path)

- Triggered after a delta is detected. Runs server-side via a queue, never in the request path.
- Compute the intersecting set first (which sessions' claims touch the delta). Only intersecting pairs go to the model: the delta plus that one teammate's intent manifest, on a cached prefix.
- Outputs: (1) a per-recipient advisory rewritten for that teammate's current task, and (2) a spec patch as a PR to docs/spec.md reflecting the new contract.
- The two advisories for two recipients must differ (see RUBRIC). That difference is the proof this is an arbiter, not a notifier.

## Tech stack and suggested repo structure

TypeScript throughout (hooks are .ts, Node 18+, npx installer). An MCP server over HTTP plus a simple HTTP or SSE bus for the dashboard. State in SQLite. Web tower in whatever renders the design system cleanly. The arbiter is a Node service calling the Anthropic API (claude-opus-4-8) asynchronously.

```
datum/
  CLAUDE.md
  docs/        BUILD_PLAN.md, RUBRIC.md, design files
  server/      bus + registry + watchlist parser + arbiter queue + MCP server
  cli/         npx datum init (writes .claude/settings.json hooks block + hook scripts + registers MCP server)
  hooks/       datum-fence.ts, datum-claim.ts, datum-join.ts, (datum-guard.ts)
  web/         the tower (epoch strip + drift card real and animated; rest static)
  demo/        workspace-invites seed repo, scripted emitter, the datum demo script
```

## Sample data (use verbatim everywhere)

- Team: acme/workspaces, feature "workspace invites", 3 sessions.
- Sessions: asha (data layer, branch asha/schema), ben (api, branch ben/api), chen (frontend, branch chen/ui).
- Contracts: db.users v8, api.GET /users/:id v3, api.POST /invites v1, deps.db-driver v2.
- The hero delta: db.users v7 to v8 at 14:02:11. users.email renamed to contact_email, migration 0042. Why, from asha: "phone signups make email the wrong name."
- Lifecycle timings (real, keep them honest in any time-lapse): detected 0.3s, ben's write fenced 5.8s, advisories delivered 6.4s, both consumers reconciled by 14:03:40, spec PR #14 opened 14:04.
- Advisories differ per recipient. To ben (routes/users.ts): users.email is now contact_email (migration 0042, asha); your open diff selects .email in two queries, update both before your next write. To chen (UserCard.tsx): UserDTO.email renamed, regenerate types from the API client; UserCard.tsx line 18 reads user.email and will break at runtime.
- Ledger: #112 14:02 asha rename users.email; #111 13:41 chen adopt zod for DTO parsing; #110 13:18 ben invites API returns 202 plus job id.
- Metrics: deltas today 4, writes fenced 3, delta-to-fence 5.8s, rework avoided ~412k tokens.

## The not-a-dashboard discipline (do not skip this)

The product is the protocol, the hooks, and the arbiter. The web view (the tower) is read-only observability on top. The Build Day prohibits projects where a dashboard is the main feature, and the litmus test is: delete the dashboard and the product still works (the fence still fires, advisories still inject, the spec PR still opens). Build the terminal path first and make it real. The dashboard must never be the thing that makes the demo function. Datum acts (blocks tool calls), injects (changes agent behavior mid-flight), and generates (tailored advisories, spec PRs); the view only reflects that.

## Definition of done and what to fake

- Real and animated: the epoch strip and the drift card, per docs/datum-drift-card-animation-spec.md and the working reference HTML. These carry the live demo.
- Real: the fence (a PreToolUse deny on a genuine registry version mismatch), the PostToolUse streaming, the SessionStart sync, the arbiter producing two real per-recipient advisories and a real PR.
- Static or seeded is fine: the registry browse screen, the replay screen, the metrics strip, ledger history beyond the live delta.
- Cut if short: replay, mobile. Build what is on camera, fake the rest convincingly.

## Reference files in this folder

- datum-design-context.md: the full design brief. Surfaces (terminal is the cockpit, web is the tower), screens, the drift card anatomy, design principles, the strict color discipline, vocabulary, and anti-patterns. Authoritative for UI.
- datum-pitch.md: the positioning one-pager.
- datum-drift-card-animation-spec.md: the exact stage-by-stage choreography for the drift card and epoch strip.
- datum_tower_drift_state.html: static mockup of the target Tower drift state.
- datum_drift_card_animation_reference.html: a working animated reference of the drift card on a compressed timeline. Open it in a browser and lift the state-machine structure (states: calm, detected, fenced, advised, reconciling, reconciled, patched, driven by events).
- datum Design System/: the Claude Design export. Apply these tokens and components to the web build.
