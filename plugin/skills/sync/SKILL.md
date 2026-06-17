---
name: sync
description: Use before editing a shared contract surface (a DB schema or migration, an API route, or a dependency manifest) in a Datum workspace. Reviews advisories and deltas since your last sync so your write matches current truth and the fence never has to fire.
---

# Sync

Contract surfaces are the files teammates depend on: DB schemas and migrations, API
routes, and dependency manifests. When one of these moves under you, your in-flight
edits go stale. Syncing before you touch a shared surface pulls the latest truth so
you edit against the current contract, not yesterday's, and the fence never has to
deny your write.

## When to sync

Before editing any contract surface, including:

- DB schema or migration files (`*.prisma`, `schema.sql`, `migrations/**`, models).
- API routes, controllers, OpenAPI specs, or routers.
- Dependency manifests (`package.json`, `requirements.txt`, `go.mod`, `Cargo.toml`).

## Procedure

1. Call `datum_sync`. It returns:
   - `registry_version`: the current truth version.
   - `advisories`: arbiter guidance addressed to you about deltas that touch your work.
   - `deltas`: contract-surface changes since your last synced version.
2. Read every advisory and delta. For each, check whether it touches the symbol,
   column, route, or version you are about to change.
3. If anything you depend on changed, update your edit to match the new contract
   before you write. Use the mechanical change in the delta (for example old name to
   new name) as the source of truth.
4. If nothing intersects your work, proceed with the edit.

Sync is cheap and idempotent. Run it again any time you are unsure whether the
ground has shifted.
