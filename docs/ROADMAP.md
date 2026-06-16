# Datum — product roadmap

> The real-time coordination layer for teams whose engineers each run AI coding agents against the same repo.
> **Git coordinates code at rest. Datum coordinates agents in motion.**

This is the north-star document for building Datum into a company. It defines the
product vision, the open-core business model, the target architecture, and the
sequence of sub-projects that get us there. Each sub-project below gets its own
spec → plan → build cycle; this doc is the map they all hang off.

Status: **draft, approved 2026-06-16.** Living document — revise it as reality teaches us.

---

## 1. Positioning

Every engineer is becoming an orchestrator. On a team where each person runs Claude
Code agents in parallel against the same feature, the team does spec-driven
development right — shared spec, common `CLAUDE.md`, PRDs split per engineer — and
then implementation starts and truth changes. One agent renames a column or swaps a
dependency, and the others keep building against a contract that no longer exists.
The drift surfaces at merge, after the rework is already paid for.

Specs and `CLAUDE.md` are snapshots. Agents in flight have no live source of truth.
Datum is that source of truth, and it catches drift at the next write instead of at
merge.

- **Wedge:** Claude Code teams. Hooks make integration zero-friction; the pain is acute today.
- **Expansion:** the contract registry and event protocol are agent-agnostic, so Cursor, Codex, and custom harnesses follow.
- **End state:** the control plane every agent on a team reads before it writes, priced per seat like the infrastructure it replaces meetings with.

The OSS protocol earns trust and spreads; Datum Cloud sells the convenience and
collaboration a single team cannot self-host. We monetize *we-run-it*, *multi-team*,
and *we-pay-for-the-model* — never a paywalled core.

---

## 2. Business model: open core + hosted cloud

### The boundary

| Free OSS — MIT, self-hostable, free forever | Datum Cloud — premium, per-seat |
|---|---|
| `datumctl` CLI (all commands) | **Hosted multi-tenant bus** — we run it, no VM/tunnel to maintain |
| The hooks (fence / claim / join / guard) | Accounts, orgs, **multiple workspaces**, SSO (GitHub OAuth → SAML on enterprise) |
| MCP server | **The management dashboard** (members, workspaces, registry browse/edit, ledger, advisory history, settings) |
| Single-team bus + registry + watchlist + **fence** (self-hosted, one workspace) | **Pooled arbiter** — we pay the model cost, no BYO key, per-plan usage caps |
| **The arbiter** (advisories + spec PRs), **BYO Anthropic key** | Unlimited **history + retention + audit log** |
| The **Claude Code Skills + plugin** | **Cross-repo / cross-workspace** coordination for orgs |
| Read-only tower (local) | Analytics (drift trends, rework-avoided, fence stats), RBAC, support/SLA |
| Git-native team layer ("the team is the repo") | Enterprise: SAML/SSO, audit export, VPC/on-prem |

**Principle — the core is never crippled.** A team can self-host everything,
including the Opus arbiter (with their own key). Cloud sells convenience and
collaboration, not a paywalled brain.

### Pricing shape (indicative; validate with design partners)

- **Self-hosted OSS** — $0 forever. BYO Anthropic key for the arbiter.
- **Cloud Free** — up to 3 seats, 1 workspace, 7-day history, pooled arbiter with a monthly advisory cap. $0.
- **Cloud Team** — per-seat/mo (indicative ~$20/seat), unlimited workspaces, extended retention, higher arbiter cap, analytics, RBAC.
- **Cloud Enterprise** — custom: SAML/SSO, audit export, VPC/on-prem, SLA, unlimited retention.
- **Arbiter usage** — pooled with per-plan caps; overage metered, or BYO-key on Cloud to bypass the pool.

---

## 3. Target architecture (Datum Cloud on Cloudflare)

The bus you already built *is* a Durable Object waiting to happen.

- **`WorkspaceBus` Durable Object — one per workspace.** Today's `server/` (bus +
  registry + watchlist + fence version + reconcile) lifted almost verbatim: the DO's
  SQLite storage replaces `node:sqlite`, hibernatable WebSockets replace the SSE
  fan-out, and the per-workspace single-registry model maps 1:1. The arbiter still
  triggers off it, off the critical path.
- **Worker (router / API).** HTTP entry: authenticates the request, resolves
  `workspace_id → DO`, serves the dashboard API. The fence still long-polls
  `GET /version`; only the host changes from localhost to the hosted DO.
- **D1 (account plane).** Accounts, users, orgs, workspace metadata, memberships /
  RBAC, plan / subscription, API tokens — the cross-tenant relational data. DO holds
  per-workspace coordination state; D1 holds who-can-access-what + billing.
- **Arbiter = Queue + consumer Worker.** Pooled Anthropic key (Cloud) or the team's
  BYO key (OSS), calling `claude-opus-4-8`. Writes advisories back into the DO and
  opens the spec PR via a **GitHub App** (server-side replacement for the local `gh`).
- **Auth.** GitHub OAuth for dashboard login (dev-tool default, fits git-native
  identity); per-team bearer API tokens for CLI / hooks → hosted bus; SAML on enterprise.
- **The fence stays client-side and OSS.** Unchanged. Core is never crippled.

**The win:** ~70% of `server/` ports into the DO; the protocol, hooks, and fence are
identical whether the bus is localhost or Cloudflare. The arbiter is model-agnostic —
a one-line swap if a different model returns.

---

## 4. Sub-projects

Each is an independent spec → plan → build cycle.

### WS0 — Repo professionalization
Turn the hackathon artifact into a credible open-core devtool a stranger can land on,
trust, and contribute to.
- Archive Build-Day material to a `hackathon-v0.2.0` git tag, strip it from `main`
  (BUILD_PLAN, RUBRIC, submission, workflows, session-log, SUMMARY, shotlist, reel,
  the bundled design-system export).
- Rewrite README, CLAUDE.md, the pitch, and `docs/` as product, not submission.
- Add `CONTRIBUTING.md`, `SECURITY.md`, `CODE_OF_CONDUCT.md`, `CHANGELOG.md`, issue /
  PR templates, and GitHub Actions CI (`npm test` + `datum demo` as gates).
- Stand up the open-core monorepo layout (`packages/` OSS core, `cloud/` hosted plane)
  so later workstreams have a home.

### WS1 — Claude Code Skills + plugin
Make agents use Datum natively. A `.claude-plugin` bundling the hooks + MCP + a set of
Skills:
- claim scope on session start and publish a good intent manifest,
- sync + check advisories before a risky write,
- interpret a fence denial and self-correct,
- record a decision to the ledger.
Ships on OSS, no backend. This is what makes the free wedge irresistible and is the
public-launch milestone.

### WS2a — Multi-tenant backend (Cloud core)
The Cloudflare plane in §3: Worker + `WorkspaceBus` DO + D1 + GitHub OAuth + API
tokens + arbiter Queue + GitHub App. Port `server/` logic into the DO. CLI / hooks
gain a hosted-bus mode (point sessions at a Cloud URL with a token).

### WS2b — Management dashboard
The Pages web app: GitHub login → org / workspace switcher → members + roles,
workspaces, **contract registry browse + edit**, decision ledger, advisory history,
live drift-card tower per workspace, settings. The existing read-only tower grows
into the authenticated multi-tenant app.

### WS2c — Billing + gating
Stripe per-seat + metered arbiter usage; plan gates (seats, workspaces, retention,
arbiter caps) enforced in the Worker / DO; free-tier + upgrade flow.

---

## 5. Sequence & milestones

**Committed order: OSS wedge first** — WS0 → WS1 → WS2a → WS2b → WS2c. Earn adoption
and credibility on the free tool before building the paid plane (standard open-core
go-to-market).

- **M1 — Credible OSS** (WS0): a stranger can land, trust it, and contribute. CI green.
- **M2 — Irresistible wedge** (WS1): native agent behavior shipped; public OSS launch (docs site, Show HN). Adoption compounds here.
- **M3 — Cloud private beta** (WS2a + WS2b): hosted bus + dashboard; design partners onboard with no VM; arbiter pooled.
- **M4 — Monetize** (WS2c): per-seat billing, free tier, GA.

---

## 6. Status today (starting point)

- `datumctl` published to npm (`0.2.0`); zero runtime deps, Node built-ins only.
- OSS core working: CLI (all commands), hooks (fence/claim/join/guard), MCP server,
  deterministic fence (fires with the arbiter disabled), watchlist + monotonic
  registry, the Opus 4.8 arbiter (real per-recipient advisories + spec PR).
- Self-hosted git-native team layer ("the team is the repo", zero login).
- Read-only tower deployed; headless `datum demo` passes end to end.
- Not yet built: everything in WS1–WS2c, plus the WS0 cleanup.

---

## 7. How to use this doc

This is the map, not a plan. When we start a sub-project we write its own spec
(`docs/superpowers/specs/`), then an implementation plan, then build it with the
core frozen and verified continuously. Revise this roadmap whenever reality diverges
from it — a stale roadmap is exactly the drift Datum exists to prevent.
