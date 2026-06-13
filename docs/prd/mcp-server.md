## MCP server (registry tools)

### Visible behavior
Inside a Claude Code session the agent has four Datum tools available without leaving the terminal. On camera: ben asks "what's the current users schema?" and the agent calls `datum_registry_snapshot()`, returning `registry_version: 8` with `db.users` at `current_version: 8` (`users.email` now `contact_email`). asha records her rename with `datum_decide("rename users.email, phone signups landing")`, which appends ledger `#112` and reports the (unchanged) epoch. A teammate calls `datum_my_advisories()` and reads ben's tailored advisory in-context. No browser is open; this is the cockpit, not the tower.

### Interface / contract
Per schema.md §4 "MCP server (registered by `datum init`)", a Node HTTP MCP server exposing exactly four tools, each a thin proxy over the bus (`DATUM_BUS_URL`, default `http://127.0.0.1:4317`):
- `datum_registry_snapshot()` → `GET /registry` → `{ registry_version, contracts: Contract[] }`.
- `datum_deltas_since(version)` → `GET /deltas?since=version` → `{ deltas: Delta[] }`.
- `datum_decide(description, contract?)` → `POST /decide` body `{ author, description, contract? }` → `{ ledger_id, registry_version }`.
- `datum_my_advisories()` → `GET /sessions/:id/advisories` → `{ advisories: Advisory[] }`.
Session identity (`session_id`, `human`) is read from `.datum/state.json` (§8). The server never calls the model; it reads truth the deterministic path already produced. Fail open: bus unreachable → tool returns a structured warning, not a crash.

### Acceptance test
`test/mcp.test.ts`. Ties to RUBRIC "PostToolUse streams an edit to the bus; an edit on a contract surface bumps the monotonic registry version" and "SessionStart registers a session and injects the current registry snapshot": against a seeded bus at the workspace-invites state, assert `datum_registry_snapshot()` returns `registry_version === 8` with `db.users.current_version === 8`; `datum_deltas_since(7)` returns the one `rename_column users.email→contact_email` delta (migration 0042, author asha) and `datum_deltas_since(8)` returns `[]`; `datum_decide("...")` returns a numeric `ledger_id`. Tools resolve with the tower stopped (not-a-dashboard).

### Files it touches
- `server/mcp.ts` — the MCP server + four tool handlers.
- `test/mcp.test.ts` — tool-contract assertions.

### Open questions / risks
- `datum_decide` author resolution depends on `.datum/state.json`; if absent, fall back to an explicit arg or fail open.
- Depends on bus-registry (#1) endpoints being frozen as in §4; no new endpoints invented here.

---
### Reconciliation (binding, post-critic)
- **MCP registration is contributed through hooks-installer's idempotent `mergeSettingsBlock` helper** in `cli/init.ts` — this track does **not** author `cli/init.ts` directly (hooks-installer is sole owner), avoiding a merge race.
- **`datum_decide` is epoch-NEUTRAL** (returns the *current* `registry_version`); only contract-surface edits bump.
