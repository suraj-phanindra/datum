## three hooks + npx datum init installer

### Visible behavior
On camera: an engineer runs `npx datum init` in `acme/workspaces`. The command writes a `hooks` block into `.claude/settings.json`, drops three executable hook scripts, registers the Datum MCP server, and seeds `.datum/state.json`. It prints what it wired and exits 0.

Then a real Claude Code session starts: `datum-join` posts the session and the agent's first context shows the injected registry snapshot (epoch v7, contracts incl. `db.users`). As asha edits `migrations/0042_*.sql`, `datum-claim` streams the edit and the epoch ticks to v8. When ben's agent tries to write `.email` in `routes/users.ts`, `datum-fence` denies the tool call and the agent reads the reason naming `db.users`, `email→contact_email`, `asha`. With the bus down, hooks fail open and the agent keeps working.

### Interface / contract
- **datum-join** (SessionStart): `POST /sessions` `{ session_id, human, branch, claim_files, claim_symbols }` → `{ registry_version, snapshot, advisories }`; emits `session.joined` + `claim.published`; injects `snapshot` via `hookSpecificOutput.additionalContext`.
- **datum-claim** (PostToolUse): reads `tool_response ?? tool_output`; `POST /events` `edit.streamed` `{ session_id, human, tool_name, path, summary }` → server runs `classifyEdit` + `bumpRegistry`, returns `{ ok, registry_version, delta? }`; confirms sync via `additionalContext`.
- **datum-fence** (PreToolUse): builds `FenceInput` from `.datum/state.json` (`lastSyncedVersion`) + `GET /version` (only on suspicion) + `GET /deltas?since=N`, calls shared `decideFence(input) → FenceDecision`. `deny` → exit 0 with `hookSpecificOutput.permissionDecision:"deny"` + `permissionDecisionReason` (the schema §7 stale-symbol copy); `inject` → `additionalContext`. Fail open per schema §8.
- **init** seeds `state.json` `{ session_id, human, branch, last_synced_version, claim_files, claim_symbols, bus_url }` (default `DATUM_BUS_URL=http://127.0.0.1:4317`), matchers with `type:"command"` and `${CLAUDE_PROJECT_DIR}` paths.

### Acceptance test
`test/installer.test.ts` satisfies RUBRIC "SessionStart registers a session and injects the current registry snapshot" and "PreToolUse denies a write that targets a contract changed since the session's last sync." Assertions: after `init`, `.claude/settings.json` contains SessionStart/PostToolUse/PreToolUse entries pointing at the three `${CLAUDE_PROJECT_DIR}` hook paths, the MCP server is registered, and `.datum/state.json` exists with `bus_url`. A simulated PreToolUse (ben writing `.email`, behind by 1 epoch) yields `permissionDecision:"deny"`.

### Files it touches
`cli/datum.ts`, `cli/init.ts`, `hooks/datum-join.ts`, `hooks/datum-claim.ts`, `test/installer.test.ts`. Imports `decideFence` from `server/fence.ts` (does not redefine it); `hooks/datum-fence.ts` is authored by the fence track.

### Open questions / risks
Confirm hook JSON field names against the live Claude Code hooks reference before freezing the template (done in Phase 0: deny is exit-0 + `hookSpecificOutput`; PostToolUse input is `tool_response ?? tool_output`). `init` must be idempotent and merge (not clobber) a pre-existing `hooks` block. Sequencing: depends on bus-registry (`/sessions`, `/events`) and fence (`decideFence`).

---
### Reconciliation (binding, post-critic)
- **datum-claim owns the re-sync write-back:** after a successful `edit.streamed` round-trip, call `PATCH /sessions/:id` and write `last_synced_version = returned registry_version` back to `.datum/state.json`. Without this a reconciled agent stays "behind by one epoch" forever and the Stop guard loops.
- **Sole owner of `cli/init.ts`.** Expose an **idempotent merge helper** (`mergeSettingsBlock`); mcp-server contributes its MCP registration snippet and stop-guard its `Stop` matcher *through* that helper — never by editing `init.ts` directly.
- **`hooks/datum-fence.ts` is authored by the fence track**; the installer only wires it into `settings.json`.
