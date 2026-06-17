---
name: coordinate
description: Use when starting work in a Datum workspace, or run it directly as /datum:coordinate to see who else is active and the current drift before you touch shared code. Teaches the claim, sync, resolve, decide loop and orients you on live truth.
---

# Coordinate

Datum is the real-time coordination layer for teammates running agents against the
same feature. Git coordinates code at rest; Datum coordinates agents in motion. Use
this skill at the start of a session in a Datum workspace, or on demand, to orient
yourself before editing shared code.

## Procedure

1. Call `datum_sessions` to see who else is active: each session's human, branch,
   claim (files and symbols), and status. This is who you might collide with.
2. Call `datum_sync` to pull the current `registry_version`, your `advisories`, and
   the `deltas` since you last synced. This is the live truth your work must match.
3. Summarize for the user: who is working on what, the current registry version, and
   any deltas or advisories that touch the area they are about to change.

## The loop

Datum coordination is four steps. Point the user at the matching skill for each:

- claim: publish what you are about to work on (files, symbols, task) so drift is
  scoped accurately. Skill: `/datum:claim`.
- sync: review advisories and deltas before editing a shared contract surface, so the
  fence never has to fire. Skill: `/datum:sync`.
- resolve: when a write is denied by the fence, re-sync and self-correct against the
  mechanical delta. Skill: `/datum:resolve-fence`.
- decide: when you change a contract (rename a column, change an API shape, swap a
  dependency version), record it so teammates' agents see it. Skill: `/datum:decide`.

Start every task by claiming your scope and syncing. Notes: a fence deny is normal
and expected, not an error; it means the registry moved under you. Re-sync and
continue.
