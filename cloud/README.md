# cloud/ — Datum Cloud (hosted plane)

This directory is the home for **Datum Cloud**, the hosted, multi-tenant premium
plane. It is a placeholder today; the implementation lands in WS2a.

Datum Cloud is the managed counterpart to the self-hostable MIT core in this repo. The
core is never crippled: a team can run the whole protocol (CLI, hooks, MCP, the
single-team bus + registry + fence, and the arbiter with a bring-your-own Anthropic
key) for free. Cloud sells the things a single team cannot easily self-host:

- a hosted multi-tenant bus (no VM or tunnel to maintain),
- accounts, orgs, and multiple workspaces with SSO,
- the team-management dashboard,
- a pooled arbiter (we pay the model cost),
- unlimited history, retention, and audit,
- cross-repo coordination and analytics.

## Planned architecture (Cloudflare)

- **`WorkspaceBus` Durable Object**, one per workspace: the current `server/` bus +
  registry + watchlist + fence version + reconcile, lifted into a stateful per-tenant
  object (DO SQLite storage in place of `node:sqlite`, hibernatable WebSockets for
  fan-out).
- **Worker (router / API)**: authenticates, resolves `workspace_id -> DO`, serves the
  dashboard API.
- **D1 (account plane)**: accounts, users, orgs, memberships, plans, API tokens.
- **Arbiter Queue + consumer Worker**: pooled or BYO key, opens the spec PR via a
  GitHub App.

The fence stays client-side and in the OSS core; only the bus host changes from
localhost to the hosted Durable Object.

See [`docs/ROADMAP.md`](../docs/ROADMAP.md) for the full plan and sequencing.
