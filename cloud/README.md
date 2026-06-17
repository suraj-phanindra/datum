# Datum Cloud (Cloudflare backend)

The hosted, multi-tenant plane for Datum. A team joins with a token instead of
running its own `datumctl serve`. The hosted bus runs the **same coordination
core** as the OSS self-hosted bus (`server/store.ts`, `registry.ts`,
`watchlist.ts`, `fence.ts`, `reconcile.ts`, `router.ts`); only the transport and
the account plane are new.

Pieces:

- **`WorkspaceBus` Durable Object** (`src/workspace-bus.ts`), one per workspace:
  the bus + registry + sessions + fence version + reconcile over DO SQLite,
  addressed by `getByName(workspace_id)`.
- **Worker router** (`src/worker.ts`): authenticates, resolves
  `workspace_id -> DO`, forwards the request.
- **D1 account plane** (`migrations/0001_init.sql`): accounts, users,
  workspaces, memberships, API tokens.
- **Arbiter Queue + consumer** (`src/arbiter-consumer.ts`): off the critical
  path. Producer is the DO on `delta.detected`; the consumer runs `runArbiter`
  (Opus 4.8 advisories) and opens the spec PR via a GitHub App.

The fence stays client-side and OSS: the `PreToolUse` hook long-polls the hosted
`/version` (cached locally), only round-trips on a mismatch, and **fails open**
on any DO/Worker timeout or 5xx.

## /w/:workspace_id routing

The Worker fronts every Durable Object. Bus requests are addressed at:

```
https://<your-worker>.workers.dev/w/<workspace_id>/<bus-path>
```

The Worker authenticates the request, resolves the `<workspace_id>` segment to a
DO via `env.WORKSPACE_BUS.getByName(workspace_id)`, strips the
`/w/<workspace_id>` prefix, and forwards the bare bus path (`/version`,
`/registry`, `/events`, `/deltas`, `/sessions`, `/stream`, ...) to the DO's
`fetch` handler. The DO adopts the first `workspace_id` it sees and is isolated
per workspace by construction. The `workspace_id` is the git-native key the
client already derives (`host/owner/repo`); it is unchanged, it just points at
the hosted bus instead of localhost.

## Deploy

All commands run from this directory.

```sh
cd cloud
npm install
```

### 1. Authenticate Wrangler

```sh
wrangler login
```

### 2. Create the D1 account plane

```sh
wrangler d1 create datum-accounts
```

Copy the printed `database_id` into `wrangler.jsonc` under the `d1_databases`
binding (`binding: "DB"`, `database_name: "datum-accounts"`).

### 3. Create the arbiter queues

```sh
wrangler queues create datum-arbiter
wrangler queues create datum-arbiter-dlq
```

`wrangler.jsonc` already wires the producer (`binding: "ARBITER_QUEUE"`, queue
`datum-arbiter`) and the consumer (`max_retries: 3`,
`dead_letter_queue: "datum-arbiter-dlq"`).

### 4. Register the GitHub OAuth app (dashboard login)

GitHub > Settings > Developer settings > **OAuth Apps** > New OAuth App.

- Homepage URL: `https://<your-worker>.workers.dev`
- Authorization callback URL: `https://<your-worker>.workers.dev/auth/callback`

Note the **Client ID** and generate a **Client secret**. Scope used by the
Worker is `read:user`.

### 5. Register the GitHub App (server-side spec PRs)

GitHub > Settings > Developer settings > **GitHub Apps** > New GitHub App.

- Repository permissions: **Contents: Read & write** and **Pull requests: Read &
  write** (the consumer creates a branch, commits `docs/spec.md`, and opens a
  PR).
- Generate and download a **private key** (PEM, PKCS8).
- Note the **App ID**.
- Install the app on the target repo/org and note the **Installation ID** (in
  the installation URL: `.../installations/<id>`).

### 6. Set secrets

Secrets never live in `wrangler.jsonc`. Set each with `wrangler secret put`:

```sh
# GitHub OAuth (dashboard login) + session signing
wrangler secret put GITHUB_CLIENT_ID
wrangler secret put GITHUB_CLIENT_SECRET
wrangler secret put SESSION_JWT_SECRET           # random 32+ byte string for HS256

# GitHub App (server-side spec PRs)
wrangler secret put GITHUB_APP_ID
wrangler secret put GITHUB_APP_PRIVATE_KEY       # paste the full PKCS8 PEM
wrangler secret put GITHUB_APP_INSTALLATION_ID

# Pooled arbiter model key (Opus 4.8)
wrangler secret put ANTHROPIC_API_KEY
```

These match the frozen `Env` interface in `src/env.ts`. For
`GITHUB_APP_PRIVATE_KEY`, paste the entire PEM including the
`-----BEGIN PRIVATE KEY-----` / `-----END PRIVATE KEY-----` lines; the Worker
imports it via `crypto.subtle` for RS256 App-JWT signing.

### 7. Apply the D1 migrations and deploy

```sh
wrangler d1 migrations apply datum-accounts --remote
wrangler deploy
```

`wrangler deploy` ships the Worker, the `WorkspaceBus` DO (with the
`new_sqlite_classes` migration tagged `v1` in `wrangler.jsonc`), the D1 binding,
and the queue producer + consumer.

### 8. Point a team at the hosted bus

On each engineer's machine:

```sh
datum login --bus https://<your-worker>.workers.dev/w/<workspace_id>
```

`datum login` runs the GitHub OAuth flow, obtains an API token, and writes the
hosted `bus_url` + token into local config so the CLI, hooks, and MCP all run in
**cloud mode** (they send `Authorization: Bearer <token>` when a token is
present). Everything else (fence, claim, sync, the skills) is identical
against the hosted bus. The `<workspace_id>` is your git-native
`host/owner/repo` key; the `/w/<workspace_id>` path is what the Worker routes to
the per-workspace Durable Object.

## Local development

Run the DO, D1, and Queues locally with Wrangler:

```sh
wrangler d1 migrations apply datum-accounts --local   # seed the local account plane
wrangler dev                                          # DO + D1 + queues, locally
```

Point the CLI at the local Worker:

```sh
datum login --bus http://localhost:8787/w/<workspace_id>
```

### Tests

The cloud test (`test/workspace-bus.test.ts`) uses Vitest with
`@cloudflare/vitest-pool-workers`. It addresses a `WorkspaceBus` instance for a
test `workspace_id`, POSTs a contract-surface edit (`edit.streamed` on a
`migrations/*.sql` rename), and asserts `GET /version` incremented by 1,
`GET /deltas?since=prev` returns the delta, and `GET /registry` shows the new
version, proving the DO runs the shared core over DO SQLite.

```sh
npx vitest
```

The pool-workers config provisions the DO and bindings in `workerd` so the test
exercises real DO SQLite. The refactored OSS `Store`/registry/fence also run the
existing node suite unchanged on `NodeSqliteBackend` (`npm test` at the repo
root), so the registry/version/fence/reconcile behavior is provably identical
across OSS and Cloud.
