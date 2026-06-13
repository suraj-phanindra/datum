# Datum feature index + PRD set

Prioritized decomposition for the build. **Demo-critical first** (the fence + self-correction, then registry + version bump, then arbiter + spec PR, then the tower, then the rest). Every feature codes against [`schema.md`](./schema.md) — the frozen shared contract. Each `<feature>.md` PRD states: **visible behavior · interface/contract · acceptance test tied to a RUBRIC item · files it touches**. The anti-drift critic pass, the binding resolutions to its 7 findings, and the **sole-owner matrix** (which resolves all file conflicts) live in [`RECONCILIATION.md`](./RECONCILIATION.md) — read it before touching a shared file.

Build/dependency order differs from priority: the fence is highest *priority* but depends on the bus+registry substrate, so foundations are built first (see the todo list). Tracks map to BUILD_PLAN owners: **A** bus+registry, **B** hooks+installer, **C** arbiter, **D** tower+demo.

| # | feature (PRD) | tier | track | RUBRIC tie | depends on |
|---|---|---|---|---|---|
| 1 | [`bus-registry`](./bus-registry.md) | P0 | A | version bump (mono); watchlist parser flags schema/skips README; PostToolUse streams | — |
| 2 | [`fence`](./fence.md) | **P0 ★** | B | PreToolUse deny names contract/change/author; fence fires w/ arbiter off; <50ms cache hit; fail-open | bus-registry |
| 3 | [`self-correction`](./self-correction.md) | **P0 ★** | B/D | fenced agent self-corrects on next action, no human input | fence |
| 4 | [`hooks-installer`](./hooks-installer.md) | P0 | B | SessionStart injects snapshot; PostToolUse streams+bumps; PreToolUse deny installed | bus-registry, fence |
| 5 | [`demo-runner`](./demo-runner.md) | P0 | D | `datum demo` exits 0: v8, 1 fence, 2 differing advisories, 1 PR, 3 clean merges; not-a-dashboard | all core |
| 6 | [`arbiter`](./arbiter.md) | P1 | C | two **different** advisories, each for that recipient's file/task (Opus 4.8, off critical path) | bus-registry |
| 7 | [`spec-pr`](./spec-pr.md) | P1 | C | a real PR patches docs/spec.md to the new contract, linked ledger entry | arbiter |
| 8 | [`tower`](./tower.md) | P1 | D | epoch strip + drift card; live URL reflects truth | bus-registry |
| 9 | [`drift-card-animation`](./drift-card-animation.md) | P1 | D | drift card animates detected→fenced→advised→reconciling→reconciled→patched | tower, bus (SSE) |
| 10 | [`mcp-server`](./mcp-server.md) | P2 | A | (supports SessionStart sync + decide); agent reads truth in-context | bus-registry |
| 11 | [`deploy`](./deploy.md) | P2 | D | live URL returns 200 and shows registry at v8 | tower |
| 12 | [`stop-guard`](./stop-guard.md) | P3 | B | (nice-to-have) Stop hook blocks "done" while unacked deltas intersect diff | fence |

## Per-feature scope briefs (PRD agents expand these)

**1. bus-registry** — The substrate. SQLite store (`contracts`, `contract_versions`, `ledger`, `sessions`, `events`); the HTTP bus + `/version`, `/version/wait` (long-poll), `/registry`, `/deltas?since`, `/events`, `/sessions`, `/decide`, `/stream` (SSE), `/healthz` per schema §4; the **contract-surface watchlist parser** (`classifyEdit`, schema §5) and the **monotonic `bumpRegistry`** (schema §1). A contract-surface `POST /events` bumps the epoch and emits `delta.detected`; off-watchlist does not. Files: `server/{index,bus,registry,watchlist,store,db}.ts`, `test/{watchlist,version-bump}.test.ts`.

**2. fence ★** — `decideFence` pure function (schema §7) + the `PreToolUse` hook that calls it: read `.datum` cached `last_synced_version`, `GET /version` only on suspicion, `/deltas?since`, decide allow/inject/**deny**. Deny = exit **0** with `hookSpecificOutput.permissionDecision:"deny"` + reason naming contract/change/author. Fail-open if bus down. <50ms cache hit. Files: `server/fence.ts` (decideFence, shared), `hooks/datum-fence.ts`, `test/fence.test.ts`.

**3. self-correction ★** — The deny-reason is written so the agent's *next* action fixes the code (use `contact_email`) with no human input. Defines: reason copy spec, the demo prompt sequencing that forces ben's next edit onto `.email` right after the migration, and how reconcile is detected (a clean write using `contact_email` → `reconciled`). Files: `demo/scenario.ts` (prompt sequence), references `hooks/datum-fence.ts`. Acceptance is observed in the 3-session run + asserted headlessly by demo-runner.

**4. hooks-installer** — `datum-join` (SessionStart: `POST /sessions`, inject snapshot via `additionalContext`), `datum-claim` (PostToolUse: `POST /events` edit.streamed, server bumps; confirm sync via `additionalContext`; read `tool_response ?? tool_output`), and wiring `datum-fence`. `npx datum init` writes the `hooks` block into `.claude/settings.json` (matchers, `type:"command"`, `${CLAUDE_PROJECT_DIR}` paths), drops the hook scripts, registers the MCP server, seeds `.datum/state.json`. Files: `cli/datum.ts`, `cli/init.ts`, `hooks/datum-{join,claim,fence}.ts`, `test/installer.test.ts`.

**5. demo-runner** — `demo/workspace-invites/` seed repo (v7 `users.email` schema, `routes/users.ts`, `UserCard.tsx`, branches asha/ben/chen). The scripted emitter fires the lifecycle events (schema §9 timings). Headless `datum demo` runs the scenario and asserts the six RUBRIC conditions, exiting 0 only if all hold; runs with the **web app stopped** (not-a-dashboard). Files: `demo/{datum-demo,emitter,scenario,seed}.ts`, `demo/workspace-invites/**`.

**6. arbiter** — Triggered async after `delta.detected` (queue, never request path). Compute the intersecting set first (which sessions' claims touch the delta); only intersecting pairs (delta + that teammate's manifest) go to Opus 4.8 on a cached prefix. Emit one `advisory.delivered` per recipient (shape = schema §6); the two **differ**. Model via Anthropic SDK (`claude-opus-4-8`, `ANTHROPIC_API_KEY`), CLI fallback. Files: `server/arbiter/{index,intersect,advise,prompt}.ts`, `test/advisory-shape.test.ts`.

**7. spec-pr** — After advisories, patch `docs/spec.md` in the seed repo to the new contract and open a PR (`gh pr create` if a GitHub remote exists, else a local PR artifact: branch + patch + `pr.json`) + a linked `ledger` entry (#112). Emit `spec.pr.opened` (#14). Files: `server/arbiter/spec-pr.ts`, `test/spec-pr.test.ts`.

**8. tower** — Read-only web tower on the design-system tokens (`datum Design System/`). Epoch strip (version spine), the drift card (static expanded), `current truth` registry rail with presence avatars, `ledger`, fleet-status footer, calm + drift states. Serves over HTTP, consumes `/stream` SSE + `/registry`. Strict color discipline. A `--color-*` → `--signal-*`/`--surface-*` token shim so mockup markup lifts verbatim. Files: `web/{serve,index.html,tower.js,tokens-shim.css}`, assets copied from the design system.

**9. drift-card-animation** — The `LiveDriftCard` event-driven state machine per `docs/datum-drift-card-animation-spec.md`: epoch tick v7→v8, blast-radius node flips (ben neutral→red→green, chen neutral→blue→green), lifecycle chip progression, card birth, the fence punch, settle pulse, footer slide, auto-collapse. One render path, two sources: live SSE bus + scripted emitter (compressed ~8s timeline for video). Honors `prefers-reduced-motion`; honest elapsed-time labels. Files: `web/drift-card.js`, `web/anim.css`.

**10. mcp-server** — MCP server exposing `datum_registry_snapshot`, `datum_deltas_since`, `datum_decide`, `datum_my_advisories` over HTTP, registered by `datum init`. Lets the agent read current truth and record decisions in-context. Files: `server/mcp.ts`, `test/mcp.test.ts`.

**11. deploy** — Deploy the tower (+ a seeded read-only registry at v8) to a live URL; confirm 200 and v8. Static-friendly: the tower can hydrate from a seeded snapshot JSON when no live bus. Files: `web/deploy.*`, deploy config.

**12. stop-guard** (stretch) — `Stop` hook (`datum-guard.ts`) exits 2 / `{"decision":"block"}` when unacknowledged deltas intersect the session's diff, forcing the agent to reconcile before declaring done. Files: `hooks/datum-guard.ts`, installer wiring.
