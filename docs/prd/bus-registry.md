## bus + registry (substrate)

The substrate every other track codes against: a SQLite store, an HTTP bus, and the deterministic watchlist parser that converts an edit into a versioned delta. No model touches this path.

### Visible behavior
On camera, this layer is the source of truth others render. With the web app stopped, a terminal call to `POST /events` carrying asha's edit to `migrations/0042_*.sql` (`users.email` -> `contact_email`) returns `{ ok, registry_version: 8, delta }`; `GET /version` now reports `{ registry_version: 8 }`. A second `POST /events` for a `README.md` or `*.test.ts` edit returns the same epoch unchanged. `GET /registry` shows `db.users` at `current_version` 8 alongside `api.GET /users/:id` v3, `api.POST /invites` v1, `deps.db-driver` v2. `GET /stream` emits a live `delta.detected` Event. The epoch ticks 7 -> 8 exactly once.

### Interface / contract
Implements schema.md §4 verbatim: `GET /version`, `GET /version/wait?since=N&timeout=ms` (long-poll), `GET /registry`, `GET /deltas?since=N`, `POST /sessions`, `PATCH /sessions/:id`, `POST /events`, `GET /sessions/:id/advisories`, `POST /decide`, `GET /stream` (SSE of `Event`), `GET /healthz`. Base URL `DATUM_BUS_URL` (default `http://127.0.0.1:4317`); all responses fail open. Tables `contracts`, `contract_versions`, `ledger`, `sessions`, `events` per §2 (`Contract`, `ContractVersion`, `LedgerEntry`, `Session`, `Event`). Core functions: `classifyEdit(path, before, after) -> ClassifyResult` (§5 watchlist + light parse, emitting `MechanicalChange` of kind `rename_column` for the hero delta) and `bumpRegistry(currentEpoch, delta) -> currentEpoch + 1` (§1, monotonic, only when `contractRelevant: true`). A contract-surface `POST /events` runs `classifyEdit`, bumps the epoch, appends a `ContractVersion`, and emits `delta.detected` `{ epoch, contract_id, from_version, to_version, author, ts, why, mechanical_change }`; off-watchlist does neither. `edit.streamed` is appended for every edit.

### Acceptance test
`test/watchlist.test.ts` and `test/version-bump.test.ts`. Satisfies RUBRIC: "an edit on a contract surface bumps the monotonic registry version; an edit off the watchlist does not." Asserts `classifyEdit("migrations/0042_rename.sql", before, after).contractRelevant === true` with `contractId === "db.users"` and `mechanicalChange.kind === "rename_column"` (`from: "email"`, `to: "contact_email"`); `classifyEdit("README.md", ...).contractRelevant === false`. Asserts `bumpRegistry(7, delta) === 8` and that off-watchlist edits leave the epoch unchanged.

### Files it touches
`server/index.ts`, `server/bus.ts`, `server/registry.ts`, `server/watchlist.ts`, `server/store.ts`, `server/db.ts`, `server/reconcile.ts` (added per reconciliation), `test/watchlist.test.ts`, `test/version-bump.test.ts`, `test/reconcile.test.ts`.

### Open questions / risks
- `decideFence` and the arbiter consume `/deltas` and `/sessions`; the response shapes here are blocking for tracks B and C, so freeze them first.
- SSE backpressure / replay ordering for the tower (track D) must read from the `events` table as source of truth.
- `classifyEdit` parse depth: keep `rename_column` real and the rest light to avoid scope creep.

---
### Reconciliation (binding, post-critic)
- **This track now OWNS live `reconciled` emission.** Inside `POST /events`: when a previously-fenced session lands a clean `edit.streamed` (re-checked via `decideFence` → `allow` against the same delta), emit per-session `reconciled` `{ session_id, human, contract_id, epoch, path }`; when all intersecting consumers reconcile, emit workspace `reconciled` `{ workspace: true, epoch, sessions[] }`. The demo emitter's `reconciled` is a scaffold, never the only source. Add `server/reconcile.ts` + `test/reconcile.test.ts`.
- **`POST /decide` is epoch-NEUTRAL** — append `LedgerEntry`, return the *current* `registry_version` unchanged. Only contract-surface `POST /events` bumps.
- **Ledger #112 is born here:** on detecting asha's delta, append `LedgerEntry` #112 from the delta `why` (author asha, contract `db.users`). Seed loads `#110`/`#111` only.
- **`PATCH /sessions/:id` advances `last_synced_version`** and returns `{ ok, registry_version }` (datum-claim is the caller).
