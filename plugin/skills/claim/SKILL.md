---
name: claim
description: Use when beginning a task or when your scope changes (you start touching new files or symbols) in a Datum workspace. Publishes a rich intent manifest so the arbiter can scope drift to exactly the teammates a change would affect.
---

# Claim

A claim is your intent manifest: the files and symbols you are about to work on, plus
the task in plain language. Datum's arbiter uses the intersection of claims and
contract deltas to decide which changes break whom. An accurate claim is what makes
advisories land on the right people. Publish one when you begin a task, and update it
whenever your scope changes.

## Procedure

1. Identify your scope for the task at hand:
   - `files`: the paths you expect to edit (for example `routes/users.ts`,
     `web/UserCard.tsx`).
   - `symbols`: the functions, types, columns, or routes you will touch (for example
     `UserDTO`, `users.email`, `GET /users/:id`).
2. Call `datum_claim` with `{ files, symbols }`.
   - Use `add: true` to merge the new files and symbols into your existing claim when
     your scope grows mid-task. Omit it (or pass `add: false`) to replace the claim
     when you switch to a different task.
3. Confirm the returned `claim_files` and `claim_symbols` reflect what you intend to
   work on. If they look wrong, claim again to correct them.

## Guidance

- Claim before you edit, not after. The arbiter can only protect scope it knows about.
- Be specific. A claim of every file is no claim at all; narrow files and symbols give
  precise, low-noise advisories.
- Re-claim the moment your scope shifts so teammates always see your current intent.
