---
name: decide
description: Use when renaming a DB column, changing an API shape, or swapping a dependency version in a Datum workspace. Records the decision to the shared ledger so teammates' agents see the change and self-correct, preventing drift at the source.
---

# Decide

When you change a contract (rename a DB column, change an API shape, swap a dependency
version), teammates building against the old shape will drift unless they learn about
it. Recording the decision to the shared ledger is the producer side of preventing
drift: it stamps the change with who, when, and why, and lets the arbiter rewrite
advisories for everyone whose work the change touches.

## When to decide

Record a decision whenever you make a contract-level change, for example:

- Renaming or retyping a DB column, or adding a migration.
- Changing an API request or response shape, status code, or route.
- Swapping a dependency or bumping a version that changes behavior.
- Any cross-cutting choice teammates need to build against.

## Procedure

1. Write the decision as a clear, self-contained sentence including the reason, for
   example: "Rename users.email to contact_email; phone signups make email the wrong
   name."
2. Call `datum_decide` with `{ description }`. Pass `contract` when the decision
   concerns a specific contract id (for example `db.users`, `api.GET /users/:id`) so it
   is filed against the right surface.
3. The author is read from your local session state; you do not pass it.

## Guidance

- Decide as you make the change, not later. The sooner it lands, the sooner teammates'
  agents adjust and the less rework accrues.
- State the why, not just the what. The reason is what lets teammates judge how the
  change affects their own work.
