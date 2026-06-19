# Licensing

Datum is **open core**.

## This repository (MIT)

Everything in this repository is licensed under the [MIT License](LICENSE): the
coordination protocol and all the tools built on it.

- `cli/` — the `datumctl` CLI (published to npm as `datumctl`)
- `core/` — `datum-core`, the coordination core (Store, registry, watchlist, fence,
  reconciler, transport-agnostic router, schema, arbiter) re-exported as one package
  (published to npm as `datum-core`)
- `server/` — the self-hosted coordination bus that composes the core
- `hooks/` — the four Claude Code hooks
- `plugin/` — the Claude Code plugin (hooks + MCP + skills)
- `web/` — the read-only "tower" dashboard

You can self-host all of it for free, including the arbiter (bring your own Anthropic
key). The core is never crippled.

## Datum Cloud (proprietary)

**Datum Cloud** — the hosted, multi-tenant backend and the team-management dashboard —
is **not** in this repository. It is developed in a separate, private repository and
offered as a commercial, per-seat product.

Datum Cloud depends on the public `datum-core` package, so the **same coordination
core** runs in both the self-hosted bus and the hosted plane. This is the open-core
boundary: the protocol and the wedge are open (MIT); the hosted service and its
premium features are the commercial product.

See [`docs/ROADMAP.md`](docs/ROADMAP.md) for the full open-core boundary and product plan.
