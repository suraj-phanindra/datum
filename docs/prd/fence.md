## the deterministic fence (PreToolUse)

The deterministic heart: a pure decision function plus the `PreToolUse` hook that calls it on every tool call. No model on this path. It is the demo's money shot.

### Visible behavior
On camera: ben's agent, behind by one epoch, tries to edit `routes/users.ts` selecting `.email`. Before the write executes, the terminal prints a deny and the agent stops: "db.users.email was renamed to contact_email (migration 0042, asha, 40s ago). This Edit references .email and will break. Re-sync to v8 and use contact_email." The write never lands. A `write.fenced` event surfaces on the bus. Crucially this fires with the web app and arbiter both stopped.

### Interface / contract
Pure function `decideFence(input: FenceInput) → FenceDecision` (schema §7), shared from `server/fence.ts`. `FenceInput = { write{path,tool_name,content}, lastSyncedVersion, currentVersion, deltas: Delta[] }`. Returns `{decision:"allow"}`, `{decision:"inject", additionalContext}`, or `{decision:"deny", reason}`. Algorithm: if `lastSyncedVersion === currentVersion` → allow (fast path, no HTTP); else intersect each `Delta` (the `delta.detected` payload carrying `mechanical_change`) against the write content; a stale-symbol hit (content references a `rename_column`/removed symbol) → deny; area hit → inject; no hit → allow; deny > inject > allow.

The hook `hooks/datum-fence.ts` reads `last_synced_version` from `.datum/state.json` (§8), calls `GET /version` only on suspicion, then `GET /deltas?since=N`, calls `decideFence`, and on deny exits 0 with `hookSpecificOutput.permissionDecision:"deny"` and `permissionDecisionReason` = the reason. Deny emits `write.fenced` via `POST /events`. Fail open: bus unreachable within ~1s → allow + append to `.datum/warnings.log`.

### Acceptance test
`test/fence.test.ts` satisfies RUBRIC line 18: "PreToolUse denies a write that targets a contract changed since the session's last sync, and the deny reason names the contract, the mechanical change, and the author"; plus line 25 (cache hit <50ms) and line 26 (fail open). Asserts: write to `routes/users.ts` selecting `.email`, behind by one epoch on the `db.users` v7→v8 rename → `deny`, reason string contains `db.users`, `email`, `contact_email`, and `asha`; `routes/invites.ts` → allow; content already using `contact_email` → allow; `lastSyncedVersion === currentVersion` → allow without touching deltas.

### Files it touches
`server/fence.ts`, `hooks/datum-fence.ts`, `test/fence.test.ts`.

### Open questions / risks
Depends on bus-registry (#1) shipping `/version`, `/deltas`, and the `delta.detected` payload first. Symbol matching is substring-based for the demo (`.email`); guard against `contact_email` containing `email` so a corrected write is not re-fenced. Confirm the live Claude Code hook field names against docs before wiring.

---
### Reconciliation (binding, post-critic)
- **Sole author of `server/fence.ts` and `hooks/datum-fence.ts`.** self-correction, hooks-installer, and stop-guard *consume* `decideFence` and *surface* `reason` verbatim — they never fork the reason copy.
- **The deny path is exit 0 + `hookSpecificOutput`** (confirmed against the live docs — exit 2 discards JSON). Word-boundary the stale-symbol match so `contact_email` (which contains `email`) is never re-fenced.
