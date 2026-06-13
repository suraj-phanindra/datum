# SUMMARY — Datum (proof of understanding)

Restated in my own words from CLAUDE.md, BUILD_PLAN.md, RUBRIC.md, the design context/pitch, and the animation spec. This is the contract I am building against.

## What Datum is

Datum is the real-time coordination layer for a team of developers who each run Claude Code agents against the **same feature on the same repo**. Git coordinates code *at rest*; Datum coordinates agents *in motion*. The pain: a team does spec-driven development right (shared spec, common CLAUDE.md, PRDs split per engineer), then implementation starts and truth changes — one agent renames a column or swaps a dependency, and the other agents keep building against a contract that no longer exists. The drift surfaces at merge, after the rework is already paid for. Specs and CLAUDE.md are *snapshots*; agents in flight need a *live* source of truth. Datum is that layer.

MVP = three primitives, demoed end to end with three Claude Code sessions building "workspace invites" on one repo:
1. **Contract registry + decision ledger** — a live, versioned, append-only source of truth for DB schemas, API shapes, dependency versions, and free-form decisions. Every entry stamped who / when / why. The registry version is a **monotonic integer**.
2. **Hooks, not suggestions** — one install command writes Claude Code hooks on each engineer's machine. Every edit streams to a shared bus; every tool call is fenced against the registry version *before it executes*. Coordination becomes a checkpoint the agent cannot ignore (unlike a stale markdown file).
3. **A model arbiter off the critical path** — Opus 4.8 layers judgment on top of the deterministic core: which changes break whom, per-recipient advisories rewritten for each teammate's current task, and a PR that patches the spec.

## The load-bearing architecture: fast path / slow path

**Keep the model off the critical path. Correctness is deterministic and instant; the model adds judgment, not latency.**

- **Detection (fast, ~0ms, no model):** contract surfaces are a known **watchlist** (path + light parser). The `PostToolUse` hook streams every edit to the bus; a path-and-parser check flags contract-relevant changes in milliseconds and bumps the monotonic registry version.
- **Protection (fast, consumer-side, <~50ms, no model):** each session tracks the registry version it last synced. The `PreToolUse` hook does a **version check + set intersection** on each tool call — does any fresh delta touch files/symbols in *my* claimed scope? If yes, inject the raw mechanical delta, or **deny** the write if it directly violates the new contract. Stale writes are fenced even if the arbiter never runs. Cache the version locally, long-poll for bumps, HTTP only on mismatch. **Fail open** if the bus is down (allow + warn); never brick an agent.
- **Judgment (slow, async, model):** the arbiter runs server-side via a queue, never in the request path. It computes the intersecting set first (cheap), then sends only intersecting pairs (the delta + that one teammate's intent manifest) to Opus 4.8 on a cached prefix. Outputs: per-recipient advisories + a spec-patch PR.
- **SLO is not milliseconds — it is beating the consumer's next relevant write.** Tool-call boundaries give an interception point every few seconds. The honest constraint: hooks are event-driven, not push; context lands at the next hook event. Harm only happens at writes, every write is a tool call, every tool call is an interception point. The guarantee is "no write executes against a stale contract," not "agents are telepathic."

## The three hooks (+ one stretch) and their contracts

Verified against the live docs (code.claude.com/docs/en/hooks). Input arrives as JSON on stdin; decisions return as JSON on stdout with exit 0.

- **`SessionStart` → `datum-join.ts`** (register + sync). Input: `session_id`, `cwd`, `source` (startup|resume|clear|compact). Registers the session (branch, claim), pulls the current registry snapshot, injects it via `hookSpecificOutput.additionalContext` so the agent starts on the latest truth.
- **`PostToolUse` → `datum-claim.ts`** (publish claim + activity). Input: `session_id`, `cwd`, `tool_name`, `tool_input`, `tool_response`/`tool_output`. Streams the edit to the bus; if the edited path is on the contract-surface watchlist, the server parses it and **bumps the registry version**. Publishes the session's claim + current activity; may confirm sync state via `additionalContext`.
- **`PreToolUse` → `datum-fence.ts`** (the fence — the demo's money shot). Input: `session_id`, `cwd`, `tool_name`, `tool_input`. Reads locally cached last-synced version; checks the bus (long-poll, HTTP only on mismatch); if a fresh delta's touched files/symbols intersect this write's target, either injects the mechanical delta or **denies**. Deny output (exit **0**):
  ```json
  { "hookSpecificOutput": { "hookEventName": "PreToolUse",
      "permissionDecision": "deny",
      "permissionDecisionReason": "db.users.email was renamed to contact_email (migration 0042, asha, 40s ago). This edit selects .email and will break. Re-sync to v8 and use contact_email." } }
  ```
  `permissionDecision` ∈ allow|deny|ask|defer. A **deny** blocks the tool and feeds the reason back to the agent, which self-corrects on its next action — and it is evaluated *before* any permission-mode check, so it holds even under `bypassPermissions`. (`updatedInput` to silently rewrite stale args is a documented v2 path; we ship the legible deny-and-self-correct instead.)
- **`Stop` → `datum-guard.ts`** (stretch). Exit code **2** (or `{"decision":"block","reason":...}`) forces the agent to keep working so no agent declares done while unacknowledged deltas intersect its diff.

## Data model and event types

Tables (SQLite via better-sqlite3):
- `contracts`: id, name, type (`db_schema` | `api_shape` | `dep_version` | `decision`), current_version (monotonic int), current_value.
- `contract_versions`: contract_id, version, author, ts, why, mechanical_change, value_snapshot.
- `ledger`: id (auto-inc), ts, author, description. **Append-only.**
- `sessions`: id, human, branch, claim_files (json), claim_symbols (json), last_synced_version, status.
- `events`: id, type, payload (json), ts. **The append-only bus log.**

Event types on the bus: `session.joined`, `claim.published`, `edit.streamed`, `delta.detected`, `write.fenced`, `advisory.delivered`, `reconciled` (per session + a workspace-level `reconciled` when all consumers done), `spec.pr.opened`.

Contract-surface watchlist (path + parser): db schema (`*.prisma`, `schema.sql`, `migrations/**`, drizzle, `models/**`), api shape (`routes/**`, `*.controller.ts`, `openapi.*`, trpc routers), dep version (`package.json`, `requirements.txt`, `go.mod`, `Cargo.toml` — version changes only), decision (`datum decide "..."` or an append to `DECISIONS.md`). A path match + a light parse (which symbol/column/version changed) is enough; two or three contract types carry the demo.

## The not-a-dashboard discipline

The product is **the protocol, the hooks, and the arbiter**. The web view (the *tower*) is read-only observability on top. Litmus test: **delete the dashboard and the product still works** — the fence still fires, advisories still inject, the spec PR still opens. Build the terminal path first and make it real; the dashboard must never be what makes the demo function. Datum **acts** (blocks tool calls), **injects** (changes agent behavior mid-flight), and **generates** (tailored advisories, spec PRs); the view only reflects that. (Calm by default, loud only on drift; color is strictly semantic and scarce — amber = contract surface + live epoch, red = breaking delta + fence, blue = advisory, green = reconciled/synced.)

## The definition of done (RUBRIC, model-gradable)

1. `npm test` passes: watchlist parser (schema edit flagged, README not), monotonic version bump, set-intersection fence decision (write inside a fresh delta's scope denied, outside allowed), advisory output shape.
2. `datum demo` runs the workspace-invites scenario headless, exits 0 only if: registry reaches **v8**, **exactly one** write fenced, **two** advisories delivered, **the two differ**, **one** spec PR opened, **three** branches merge clean.
3. Live URL returns 200 and shows the registry at **v8**.
4. Not-a-dashboard check: with the web app stopped, the fence still fires, the advisory still injects, the spec PR still opens.

Hero data is verbatim: db.users v7→v8 at 14:02:11, `users.email`→`contact_email` (migration 0042, asha: "phone signups make email the wrong name"); detected 0.3s, ben fenced 5.8s, advisories 6.4s, reconciled by 14:03:40, spec PR #14 at 14:04.
