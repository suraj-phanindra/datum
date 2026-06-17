## Stop guard hook (stretch)

A `Stop`-event hook that refuses to let an agent end its turn while the registry has moved past the session's `last_synced_version` and a fresh delta intersects the session's claimed scope. The fence stops a *stale write*; the guard stops a *premature "done."* Same deterministic substrate, no model.

### Visible behavior
Scenario: ben finishes editing and the agent moves to wrap up. Instead of stopping, the terminal shows the turn continue: the guard injects "Hold: db.users.email→contact_email (migration 0042, asha) landed at v8; your diff still references .email. Re-sync and reconcile before done." The agent then makes one more edit adopting `contact_email`, re-syncs, and only *then* is allowed to stop. A clean session (synced, no intersecting delta) stops immediately with no friction.

### Interface / contract
Reuses the deterministic heart verbatim. The hook reads `.datum/state.json` (schema §8: `last_synced_version`, `claim_files`, `claim_symbols`, `bus_url`), calls `GET /version`; on `last_synced_version === registry_version` it allows the stop (fast path, no further HTTP). On mismatch it pulls `GET /deltas?since=N` and calls `decideFence(input): FenceDecision` (schema §7) per delta, passing the session's accumulated diff content as `write.content`. A `{ decision: "deny" }` or `{ decision: "inject" }` against any unacknowledged `Delta` blocks the stop. Stop output (Phase-0-verified hook schema): exit `2` / `{"decision":"block","reason":"..."}` blocks; allow = exit `0`. **Fail open** (schema §8): bus unreachable within ~1s → allow stop, append to `.datum/warnings.log`. The arbiter is never consulted.

### Acceptance test
`test/stop-guard.test.ts`. Satisfies the acceptance criterion: *"Stop hook prevents an agent from declaring done while unacknowledged deltas intersect its diff."* Assertions: (1) session behind by one epoch with diff containing `.email` and the seeded `db.users` v7→v8 delta → guard returns block, reason names `db.users`, `email→contact_email`, `asha`; (2) session at `last_synced_version === registry_version` → allow, no `/deltas` call (cache-hit fast path); (3) diff already using `contact_email` → allow; (4) bus down → allow (fail-open) + warning logged.

### Files it touches
- `hooks/datum-guard.ts` (new Stop hook)
- `server/fence.ts` (import `decideFence` only; no change — fence is sole author)
- `test/stop-guard.test.ts` (new)

### Open questions / risks
- Sequencing: depends on `fence` (`decideFence`) and `hooks-installer` shipping first; **P3, cut if core slips.**
- "Session diff" source: cleanest is the union of `claim_symbols` + streamed `edit.streamed` summaries already on the bus, avoiding a git diff shell-out.
- Stop-hook re-block loop: relies on `last_synced_version` advancing post-reconcile (the resync write-back) so the fast path clears it.

---
### Reconciliation (binding, post-critic)
- **The Stop guard emits NO bus event** (it blocks locally only). It must **not** reuse `write.fenced`, which would corrupt demo-runner's "exactly one write fenced" assertion.
- **The `Stop` matcher is contributed through hooks-installer's `mergeSettingsBlock` helper**, not by editing `cli/init.ts` directly.
- The re-block loop is cleared by datum-claim's resync write-back advancing `last_synced_version`.
