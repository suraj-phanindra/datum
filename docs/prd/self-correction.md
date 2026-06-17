## agent self-correction

### Visible behavior
Scenario: ben's agent, behind by one epoch, is about to write `routes/users.ts` still selecting `.email`. The PreToolUse fence denies the Edit. The agent receives the deny reason in-context, and on its **very next tool call** rewrites the same file to use `contact_email` (no human types anything). That clean write passes the fence and the session flips `live → fenced → reconciling → reconciled`. The terminal shows the block, the corrected diff, and a re-sync to v8. The key behavior: an agent course-corrects itself mid-flight.

### Interface / contract
The deny that triggers self-correction is `decideFence(input) → FenceDecision` returning `{ decision: "deny", reason }` (schema §7). The `reason` is the self-correction payload: it names the contract `db.users`, the `MechanicalChange` `{ kind: "rename_column"; table: "users"; from: "email"; to: "contact_email"; migration: "0042" }`, the author `asha`, and the imperative fix ("Re-sync to v8 and use `contact_email`"). It is surfaced via `hookSpecificOutput.permissionDecisionReason` (deny) by `hooks/datum-fence.ts`, which also emits `write.fenced` `{ session_id, human, path, delta_epoch, contract_id, reason }`. The corrective next write streams as `edit.streamed` `{ session_id, human, tool_name, path, summary }` via `POST /events`; because its content uses `contact_email` (not the stale `.email`), `decideFence` returns `{ decision: "allow" }` and the server emits per-session `reconciled` `{ session_id, human, contract_id, epoch }`. No model call is on this path.

### Acceptance test
`test/self-correction.test.ts`. The acceptance check: a fenced agent reads the reason and self-corrects on its next action with no human input. The test drives `decideFence` twice for ben at `lastSyncedVersion: 7`, `currentVersion: 8`, deltas = the `users.email→contact_email` Delta: (1) write content selecting `.email` → asserts `decision === "deny"` and `reason` contains `db.users`, `contact_email`, `asha`; (2) the next write content using `contact_email` → asserts `decision === "allow"`. It then asserts the scenario emits exactly one `write.fenced` followed by a `reconciled` for the same `session_id`. demo-runner re-checks "exactly one write fenced" headlessly.

### Files it touches
- `demo/scenario.ts` (contributes the ben two-step section; demo-runner owns the file): prompt/edit sequence forcing ben's `.email` write right after migration 0042, then the corrective `contact_email` write.
- `demo/datum-demo.ts` (demo-runner owns): headless assertion of fence-then-reconcile.
- `hooks/datum-fence.ts` (fence owns; read-only here): surfaces `reason` verbatim.
- `test/self-correction.test.ts`: the acceptance test.

### Open questions / risks
A live agent's correction is non-deterministic, so `scenario.ts` needs a scripted `contact_email` write for the exit-0 path plus a live-agent path behind one flag. Depends on the fence shipping the final reason copy first; this PRD must not author a second reason string.

---
### Reconciliation (binding, post-critic)
- **Reconcile correlation key = `session_id` + `contract_id`** (not `session_id`+`path` — `path` is absent from the reconciled payload as a key; it rides along for UI only).
- **`reconciled` is emitted server-side by bus-registry**, not here. This PRD only constrains the deny-reason copy contract and the scripted corrective write.
- **File ownership:** `demo/scenario.ts` is owned by demo-runner; `hooks/datum-fence.ts` by fence. This feature *contributes* and *consumes* — it authors only `test/self-correction.test.ts`.
