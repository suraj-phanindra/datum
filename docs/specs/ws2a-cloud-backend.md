# WS2a — Datum Cloud multi-tenant backend (spec)

Status: DRAFT for approval (2026-06-17). This is the design checkpoint for the first
hosted sub-project. Build follows approval. See [`docs/ROADMAP.md`](../ROADMAP.md).

## Goal

Stand up **Datum Cloud**: a hosted, multi-tenant bus on Cloudflare so a team joins
with a token instead of running their own `datumctl serve`. The hosted bus runs the
**same coordination core** as the OSS self-hosted bus; only the transport and the
account plane are new.

In scope (WS2a): the Cloudflare backend (Worker router + `WorkspaceBus` Durable Object
+ D1 account plane + arbiter Queue + GitHub App for spec PRs), GitHub-OAuth login, API
tokens, and a `datum login` / cloud-mode for the CLI + hooks.

Out of scope: the management **dashboard UI** (WS2b) and **billing/plan gating**
(WS2c). WS2a ships a minimal token issuance flow, not the full web app.

## The load-bearing principle: one core, two transports

The pure logic (`server/registry.ts`, `watchlist.ts`, `fence.ts`, `reconcile.ts`) and
the `Store` are backend-agnostic. We introduce a tiny **synchronous SQL backend
interface** and run the identical core on both deployments:

```ts
// server/sql-backend.ts (new)
export interface SqlBackend {
  all(sql: string, ...params: unknown[]): Record<string, unknown>[];
  run(sql: string, ...params: unknown[]): void;
  exec(multiStatementSql: string): void;     // schema setup
}
```

- `NodeSqliteBackend` wraps `node:sqlite` `DatabaseSync` (today's `server/db.ts`) — the
  OSS self-hosted bus.
- `DoSqliteBackend` wraps `ctx.storage.sql` (`exec(...).toArray()`) — Datum Cloud.

`Store` is refactored to take a `SqlBackend` instead of holding `DatabaseSync`
directly. `registry`, `watchlist`, `fence`, `reconcile` are already pure and move
unchanged. **Net effect:** the registry/version/fence/reconcile behavior is provably
identical across OSS and Cloud, and the existing test suite runs against both backends.
This is the linchpin of WS2a; do it first.

## Architecture (Cloudflare)

| Datum piece | Cloudflare service |
|---|---|
| per-workspace bus + registry + sessions + fence + reconcile | one SQLite-backed `WorkspaceBus` Durable Object, addressed by `getByName(workspace_id)` |
| live fan-out to dashboard/CLI watchers | **hibernatable WebSockets** in the DO (cost-correct; SSE from DO `fetch` is the fallback) |
| accounts, users, memberships, workspaces, API tokens, plan | **D1** (cross-tenant relational) |
| async arbiter (intersect, Opus 4.8 advisories, spec PR) | **Queues** producer (in the DO on `delta.detected`) + consumer Worker |
| dashboard login | **GitHub OAuth** in the Worker |
| spec-patch PRs | **GitHub App** installation token from the Queue consumer (replaces local `gh`) |
| edge auth + routing | the **Worker router** in front of all DOs |

The fence stays client-side and OSS: the `PreToolUse` hook long-polls the hosted
`/version` (cached locally), only round-trips on a mismatch, and **fails open** on any
DO/Worker timeout or 5xx. DO cold-start + the ~1k-req/s-per-object serial limit stay
within the seconds-scale SLO precisely because of this client cache.

## The `WorkspaceBus` Durable Object

Ports the 16-endpoint bus (`server/bus.ts`) into the DO's `fetch` handler over a
`DoSqliteBackend`-backed `Store`. Mapping of the current routes is 1:1
(`/version`, `/version/wait`, `/registry`, `/sessions`, `/events`, `/deltas`,
`/ledger`, `/contracts/:id/versions`, `/sessions/:id/advisories`, `POST /sessions`,
`PATCH /sessions/:id`, `POST /events`, `POST /decide`, `/healthz`).

- `/stream` (SSE) becomes a hibernatable WebSocket: `ctx.acceptWebSocket`,
  `webSocketMessage`/`Close`, broadcast via `ctx.getWebSockets()`. Per-connection
  metadata via `serializeAttachment`. The DO sleeps when idle (no GB-s billed) and the
  socket survives.
- `/version/wait` (long-poll) uses a DO **alarm** or holds the request; the client
  long-poll contract is unchanged.
- `POST /events` does the watchlist classify + monotonic bump inside one
  `ctx.storage.transactionSync`, then `env.ARBITER_QUEUE.send(...)` on a
  `delta.detected` (the only critical-path write; the model stays off it).
- Schema created once via `blockConcurrencyWhile` + `CREATE TABLE IF NOT EXISTS`
  (the existing `server/db.ts` DDL, run through `DoSqliteBackend.exec`).
- The DO adopts the first `workspace_id` it sees (existing single-registry-per-team
  rule) and is isolated per workspace by construction.

`wrangler.jsonc`: `migrations: [{ tag: "v1", new_sqlite_classes: ["WorkspaceBus"] }]`.

## The Worker router

`cloud/src/worker.ts`. On each request: authenticate, resolve
`workspace_id -> env.WORKSPACE_BUS.getByName(id)`, forward (RPC or `fetch`).

- **Two auth modes:** `Authorization: Bearer <token>` (CLI + hooks) validated against
  D1 (`api_tokens`, stored as a SHA-256 hash, never plaintext); or a signed session
  cookie/JWT (dashboard, from GitHub OAuth), verified with `crypto.subtle` HMAC.
- **Membership check:** the principal's `account_id` must have a `memberships` row for
  the workspace, else 403.
- **Fail-open contract preserved:** a DO overload/5xx surfaces to the hook as
  allow-with-warning, never a spurious deny.

## D1 account plane

`cloud/migrations/0001_init.sql`:

```sql
CREATE TABLE accounts    (id TEXT PRIMARY KEY, name TEXT, plan TEXT NOT NULL DEFAULT 'free', created_at INTEGER);
CREATE TABLE users       (id TEXT PRIMARY KEY, github_id INTEGER UNIQUE, login TEXT, email TEXT, name TEXT, created_at INTEGER);
CREATE TABLE workspaces  (id TEXT PRIMARY KEY,        -- host/owner/repo (same key the git-native client derives)
                          account_id TEXT NOT NULL, display_name TEXT, created_at INTEGER);
CREATE TABLE memberships (account_id TEXT NOT NULL, user_id TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'member',
                          PRIMARY KEY (account_id, user_id));
CREATE TABLE api_tokens  (token_hash TEXT PRIMARY KEY, account_id TEXT NOT NULL, user_id TEXT,
                          name TEXT, scopes TEXT NOT NULL DEFAULT '[]', created_at INTEGER,
                          last_used_at INTEGER, revoked INTEGER NOT NULL DEFAULT 0);
```

DO SQLite holds per-workspace coordination state (events, contracts, versions, ledger,
sessions); D1 holds who-can-access-what. No cross-workspace query ever touches a DO.

## Auth + tokens (minimal for WS2a)

- **GitHub OAuth** in the Worker (`/auth/login` -> GitHub -> `/auth/callback`): upsert
  `users`, ensure a personal `accounts` row + `memberships`, mint a signed session
  JWT. Client id/secret + JWT secret are Wrangler secrets.
- **API tokens:** an authenticated user mints a token (`POST /tokens`); the plaintext
  is shown once, only the hash is stored.
- **`datum login`** (new CLI command): opens the GitHub OAuth flow (device-style or a
  localhost callback), obtains a token, and writes the hosted `bus_url` + token into
  local config so the hooks/CLI run in **cloud mode**. The git-native `workspace_id`
  is unchanged; it just points at the hosted bus.

The dashboard for managing members/tokens/workspaces visually is WS2b; WS2a's flow is
CLI + the bare OAuth pages.

## The arbiter (Queue)

- Producer: the DO calls `env.ARBITER_QUEUE.send({ workspace_id, delta })` after a
  `delta.detected`.
- Consumer (`cloud/src/arbiter-consumer.ts`): runs the existing `runArbiter` (intersect
  -> per-recipient `advise` via `claude-opus-4-8`, **pooled key** as a Wrangler secret)
  and writes `advisory.delivered` back into the workspace DO (RPC), then opens the spec
  PR. `ack()`/`retry()` with a dead-letter queue. Off the critical path, as designed.

## GitHub App (spec PRs)

`server/arbiter/spec-pr.ts` shells `git`/`gh` today (fine for self-hosted). For Cloud,
add a `GitHubAppClient` that mints an App JWT (RS256 via `crypto.subtle`), exchanges it
for an installation token, and creates the branch + `docs/spec.md` commit + PR via the
GitHub REST API. The OSS path keeps the local `gh` behavior; the Cloud consumer uses
the App client. Selected behind the same `openSpecPR` seam.

## CLI + hooks: cloud mode

No fork. `bus_url` already flows `datum.json` > env > default; `datum login` writes a
hosted `bus_url` + a token into local config, and the client (`cli/lib/client.ts`,
the hooks, the MCP) sends `Authorization: Bearer <token>` when a token is present.
Everything else (fence, claim, sync, the skills) is identical against a hosted bus.

## Repo layout

```
cloud/
  wrangler.jsonc               # DO + D1 + Queues bindings, migrations, routes
  src/
    worker.ts                  # router: auth + workspace_id -> DO
    workspace-bus.ts           # the WorkspaceBus Durable Object
    arbiter-consumer.ts        # Queue consumer (runArbiter + spec PR)
    auth/                      # GitHub OAuth + JWT + token mint/validate
    github-app.ts              # installation-token PR client
  migrations/0001_init.sql     # D1 account plane
server/
  sql-backend.ts               # NEW: SqlBackend interface + NodeSqliteBackend
  store.ts, registry.ts, ...   # refactored to use SqlBackend (shared by OSS + DO)
```

`cloud/` imports the pure core from `server/` directly (the WS0-deferred `packages/`
extraction is still unnecessary; the storage interface is the only seam we need).

## Verification

- The refactored `Store`/registry/fence run the **existing test suite** unchanged on
  `NodeSqliteBackend` (no behavior change to the OSS bus); `npm test` stays green.
- A `cloud/` test (Vitest + `@cloudflare/vitest-pool-workers`, or `wrangler dev`
  smoke) asserts the `WorkspaceBus` DO reproduces the core invariants: a contract edit
  bumps to the next version, a stale write is fenced, two advisories differ, the spec
  PR opens. These mirror the headless demo's predicates against the DO.
- `wrangler dev` runs DO + D1 + Queues locally; `wrangler d1 migrations apply` seeds
  the account plane; secrets via `wrangler secret put`.
- Fail-open: a router/DO 5xx makes the hook allow-with-warning (asserted).

## Open decisions (call these in approval)

1. **Live fan-out:** hibernatable WebSockets (recommended, cost-correct) vs SSE from DO
   `fetch` (simpler lift). Recommend WebSockets.
2. **WS2a auth surface:** ship `datum login` + bare OAuth pages now (recommended), and
   defer all visual member/token management to WS2b.
3. **Deploy target:** a new Cloudflare Worker (e.g. `api.datum.dev` once the domain is
   set up) vs a `*.workers.dev` subdomain to start. Recommend `workers.dev` for the
   beta, custom domain later.
