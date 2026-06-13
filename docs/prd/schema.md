# schema.md — the shared source of truth

**Status: FROZEN for the build. Every track codes against this.** Changes require a note here + a ping to all tracks (this is the dogfood moment — do not drift field names).

This defines: the registry/version model, the data model (tables), the event types, the bus + MCP HTTP API, the contract-surface watchlist, the **fence decision function** (the deterministic heart), the **advisory shape**, and the local hook state. Sample data is the workspace-invites scenario, used **verbatim** everywhere.

---

## 1. Versioning model

- **`registry_version`** — a single **global monotonic integer**, the workspace **epoch** / "current truth version." Increments by exactly **1** on every accepted contract-surface delta. This is the number RUBRIC checks (`registry advances to v8`) and the number the epoch strip renders. Seeded at **7**; asha's migration is the next delta → **8**.
- **per-contract `version`** — each contract carries its own monotonic counter, shown in the registry rail. These are independent of the epoch and need not equal it. Seeded: `db.users` **7→8**, `api.GET /users/:id` **3**, `api.POST /invites` **1**, `deps.db-driver` **2**.
- The drift card header shows the **db.users** per-contract transition (`v7 → v8`); because asha's migration is epoch 8 *and* db.users's 8th version, the header tick and the epoch tick coincide. This alignment is a deliberate, honest seed arrangement for demo clarity.
- A **session** tracks `last_synced_version` = the global `registry_version` it last pulled. The fence's cheap check is `last_synced_version === registry_version`.

---

## 2. Data model (SQLite via better-sqlite3)

```ts
// contracts: the current truth, one row per contract
type Contract = {
  id: string;                 // "db.users", "api.GET /users/:id", "deps.db-driver"
  name: string;               // display name, == id for the demo
  type: ContractType;         // see below
  current_version: number;    // per-contract monotonic int
  current_value: string;      // JSON snapshot of the contract's current shape
};
type ContractType = "db_schema" | "api_shape" | "dep_version" | "decision";

// contract_versions: append-only history, one row per (contract, version)
type ContractVersion = {
  contract_id: string;
  version: number;            // per-contract version this row represents
  epoch: number;              // the global registry_version when this landed
  author: string;             // "asha" | "ben" | "chen"
  ts: string;                 // ISO 8601, e.g. "2026-06-13T14:02:11Z" (demo wall time 14:02:11)
  why: string;                // quoted reason, e.g. asha: "phone signups make email the wrong name."
  mechanical_change: MechanicalChange; // structured, see §5
  value_snapshot: string;     // JSON snapshot of current_value at this version
};

// ledger: append-only decision history (the "why" stream)
type LedgerEntry = {
  id: number;                 // auto-increment, displayed as #112
  ts: string;                 // ISO 8601
  author: string;
  description: string;        // "rename users.email, phone signups landing"
  contract_id?: string;       // optional link to the contract it concerns
};

// sessions: a human + their agent, as one unit
type Session = {
  id: string;                 // claude-code session_id
  human: string;              // "asha" | "ben" | "chen"
  branch: string;             // "asha/schema" | "ben/api" | "chen/ui"
  claim_files: string[];      // JSON; files this session is building against
  claim_symbols: string[];    // JSON; symbols/columns this session touches
  last_synced_version: number;// global registry_version last pulled
  status: "live" | "fenced" | "reconciling" | "reconciled" | "idle";
};

// events: the append-only bus log (source of truth for replay + tower)
type Event = {
  id: number;                 // auto-increment
  type: EventType;            // see §3
  payload: object;            // JSON, shape depends on type
  ts: string;                 // ISO 8601
};
```

---

## 3. Event types (the bus vocabulary)

Exact strings. Do not invent new ones without updating this file.

| type | emitted by | payload (key fields) |
|---|---|---|
| `session.joined` | datum-join (SessionStart) | `{ session_id, human, branch, claim_files, claim_symbols, registry_version }` |
| `claim.published` | datum-claim / join | `{ session_id, human, claim_files, claim_symbols }` |
| `edit.streamed` | datum-claim (PostToolUse) | `{ session_id, human, tool_name, path, summary }` |
| `delta.detected` | server (watchlist parse on a contract-surface edit) | `{ epoch, contract_id, from_version, to_version, author, ts, why, mechanical_change }` |
| `write.fenced` | datum-fence (**PreToolUse deny ONLY** — the Stop guard blocks locally and never emits this, keeping "exactly one write fenced" honest) | `{ session_id, human, path, delta_epoch, contract_id, reason }` |
| `advisory.delivered` | arbiter | `{ session_id, human, recipient, file, advisory }` (advisory = §6) |
| `reconciled` | **server (bus-registry)**, per session | `{ session_id, human, contract_id, epoch, path }` |
| `reconciled` (workspace) | **server (bus-registry)**, when all consumers done | `{ workspace: true, epoch, sessions: string[] }` |
| `spec.pr.opened` | arbiter | `{ pr_number, url, contract_id, epoch, ledger_id, patch_path }` (patch_path = "docs/spec.md") |

The drift-card animation state machine is driven **only** by these events (see `docs/datum-drift-card-animation-spec.md`): `delta.detected`→detected, `write.fenced`→fenced, `advisory.delivered`→advised, `reconciled`(per session)→reconciling count, `reconciled`(workspace)→reconciled, `spec.pr.opened`→patched.

**Reconcile + re-sync + ledger (server-owned, live path — RECONCILED post-critic):**
- **`reconciled` is emitted by the server (bus-registry), for real, on the live 3-session path** — not only by the scripted emitter. When a previously-fenced session lands a clean `edit.streamed` whose content no longer references the stale symbol (verified by `decideFence` returning `allow` against the same delta), the server emits per-session `reconciled`; when all intersecting consumers have reconciled it emits the workspace `reconciled`. The emitter's `reconciled` is a test/video scaffold only and must not be the sole source.
- **Re-sync write-back:** `datum-claim` calls `PATCH /sessions/:id` after each successful `edit.streamed` round-trip to advance `last_synced_version` to the returned `registry_version`, and writes it back to `.datum/state.json`. This is what clears the fence (and Stop-guard) cache-hit fast path after a reconcile, so a corrected agent is no longer "behind by one epoch".
- **Reconcile correlation key = `session_id` + `contract_id`** (the per-session `reconciled` carries `path` for the UI, but correlation never depends on `path`).
- **Ledger on delta:** detecting a contract-surface delta also appends a `LedgerEntry` capturing the delta's `why` (author + linked contract) — this is how `#112` is born at 14:02. `POST /decide` is reserved for *free-form* decisions only and is epoch-neutral (see §4).

---

## 4. Bus + registry HTTP API (the contract between hooks ↔ server ↔ tower)

Base URL from env `DATUM_BUS_URL` (default `http://127.0.0.1:4317`). All JSON. **Fail open:** any hook that cannot reach the bus within its timeout allows the write and emits a local warning.

| method + path | purpose | response |
|---|---|---|
| `GET /version` | cheap current epoch | `{ registry_version }` |
| `GET /version/wait?since=N&timeout=ms` | long-poll; resolves when epoch > N or timeout | `{ registry_version, changed: bool }` |
| `GET /registry` | full snapshot | `{ registry_version, contracts: Contract[] }` |
| `GET /deltas?since=N` | deltas with `epoch > N` | `{ deltas: Delta[] }` (Delta = `delta.detected` payload) |
| `POST /sessions` | join/register | body `{ session_id, human, branch, claim_files, claim_symbols }` → `{ registry_version, snapshot, advisories }` |
| `PATCH /sessions/:id` | update claim / **advance `last_synced_version` (the re-sync write-back — datum-claim calls this after each round-trip)** | body partial Session → `{ ok, registry_version }` |
| `POST /events` | append an event (e.g. `edit.streamed`); server runs `classifyEdit`, may bump + append a `LedgerEntry`, and **emits `reconciled` when a previously-fenced session lands a clean write** | `{ ok, registry_version, delta?: Delta }` |
| `GET /sessions/:id/advisories` | pending advisories for a session | `{ advisories: Advisory[] }` |
| `POST /decide` | record a **free-form** decision + ledger entry. **Epoch-NEUTRAL** — returns the *current* `registry_version` unchanged (only contract-surface `POST /events` bumps the epoch) | body `{ author, description, contract? }` → `{ ledger_id, registry_version }` |
| `GET /stream` | SSE of all events (for the tower) | `text/event-stream` of `Event` |
| `GET /healthz` | liveness | `{ ok: true }` |

### MCP server (registered by `datum init`)
Exposes in-context tools so the agent can read truth and record decisions without leaving Claude Code:
- `datum_registry_snapshot()` → current `{ registry_version, contracts }`.
- `datum_deltas_since(version)` → deltas the caller hasn't seen.
- `datum_decide(description, contract?)` → append a decision (→ `POST /decide`).
- `datum_my_advisories()` → advisories addressed to the calling session.

---

## 5. Contract-surface watchlist + parser

`classifyEdit(path: string, before: string | null, after: string) → ClassifyResult`

```ts
type ClassifyResult =
  | { contractRelevant: false }
  | { contractRelevant: true; contractType: ContractType; contractId: string;
      mechanicalChange: MechanicalChange };

type MechanicalChange =
  | { kind: "rename_column"; table: string; from: string; to: string; migration?: string }
  | { kind: "add_column" | "drop_column"; table: string; column: string; migration?: string }
  | { kind: "api_field_renamed" | "api_field_removed"; route: string; from?: string; to?: string }
  | { kind: "dep_version_changed"; dep: string; from: string; to: string }
  | { kind: "decision"; text: string };
```

Watchlist (path glob → type):
- **db_schema**: `**/*.prisma`, `**/schema.sql`, `**/migrations/**`, drizzle schema, `**/models/**`.
- **api_shape**: `**/routes/**`, `**/*.controller.ts`, `**/openapi.*`, trpc routers.
- **dep_version**: `**/package.json`, `requirements.txt`, `go.mod`, `Cargo.toml` (**version changes only**).
- **decision**: a `datum decide "..."` command, or an append to `**/DECISIONS.md`.

A path match **plus a light parse** (which symbol/column/version changed) is enough. The demo's hero is the **rename_column** parse on `migrations/0042_*.sql`. Off-watchlist (e.g. `README.md`, `*.test.ts`) → `{ contractRelevant: false }` → **no version bump**. (Unit test: schema edit flagged, README not.)

Version bump: `bumpRegistry(currentEpoch, delta) → currentEpoch + 1` (monotonic; only on `contractRelevant: true`). (Unit test.)

**Casing convention (RECONCILED post-critic):** in-process TypeScript objects use camelCase (`ClassifyResult.contractId`, `contractType`, `mechanicalChange`); JSON wire + event payloads use snake_case (`Delta.contract_id`, `mechanical_change`, `Advisory.delta_ref.contract_id`). Map explicitly at the HTTP/event boundary — never spread a `ClassifyResult` straight into an event payload.

---

## 6. Advisory shape (arbiter output — unit-tested)

```ts
type Advisory = {
  recipient: string;          // "ben" | "chen"
  session_id: string;
  file: string;               // the recipient's at-risk file: "routes/users.ts" | "UserCard.tsx"
  delta_ref: { contract_id: string; from_version: number; to_version: number; migration?: string; author: string };
  severity: "fence" | "advisory";   // ben was fenced; chen advised
  body: string;               // tailored prose, addresses the recipient imperatively
  actions: string[];          // concrete steps, e.g. ["update both .email queries", "re-sync to v8"]
};
```

The two seeded advisories **must differ** (RUBRIC). Verbatim targets:
- **ben** (`routes/users.ts`, severity `fence`): "users.email is now contact_email (migration 0042, asha). Your open diff selects .email in two queries; update both before your next write."
- **chen** (`UserCard.tsx`, severity `advisory`): "UserDTO.email renamed; regenerate types from the API client. UserCard.tsx line 18 reads user.email and will break at runtime."

Test asserts: 2 advisories, `ben.body !== chen.body`, each `.file` is the recipient's file, each has ≥1 action.

---

## 7. The fence decision (the deterministic heart — unit-tested, no model)

`decideFence(input) → FenceDecision` — a **pure function**, the single most important unit under test.

```ts
type FenceInput = {
  write: { path: string; tool_name: string; content: string };  // content = new_string / file_text / command
  lastSyncedVersion: number;        // from local .datum state
  currentVersion: number;           // from bus (cache hit avoids HTTP)
  deltas: Delta[];                  // deltas with epoch in (lastSyncedVersion, currentVersion]
};
type FenceDecision =
  | { decision: "allow" }
  | { decision: "inject"; additionalContext: string }   // touches the area but no direct conflict
  | { decision: "deny"; reason: string };               // directly references a renamed/removed symbol
```

Algorithm (deterministic, ≤ ~50ms; HTTP only when `lastSyncedVersion !== currentVersion`):
1. If `lastSyncedVersion === currentVersion` → `allow` (fast path; nothing changed since sync).
2. Else, for each delta in `deltas`, compute intersection with `write`:
   - **stale-symbol hit (deny):** the write's `content` references a symbol the delta **renamed-away or removed** (e.g. delta `rename_column users.email→contact_email`; write contains `.email` / `users.email`). → `deny`, reason = "`{contract}.{from}` was renamed to `{to}` (migration {migration}, {author}, {Δt} ago). This {tool} references `.{from}` and will break. Re-sync to v{epoch} and use `{to}`." (names contract + mechanical change + author — RUBRIC requirement.)
   - **area hit, no direct conflict (inject):** the write touches a file/module in the delta's scope but references no stale symbol. → `inject` the mechanical delta as `additionalContext`.
   - **no intersection (allow):** → `allow`.
3. Precedence: any `deny` wins over `inject` wins over `allow`.

Unit tests:
- write to `routes/users.ts` with content selecting `.email`, behind by 1 epoch on the db.users rename → **deny**, reason names `db.users`, `email→contact_email`, `asha`.
- write to `routes/invites.ts` (unrelated) → **allow**.
- write already using `contact_email` → **allow**.
- `lastSyncedVersion === currentVersion` → **allow** without consulting deltas (cache-hit fast path).

---

## 8. Local hook state + fail-open

- Per-workspace state dir: `${CLAUDE_PROJECT_DIR}/.datum/`.
- `state.json`: `{ session_id, human, branch, last_synced_version, claim_files, claim_symbols, bus_url }`.
- Fence reads `last_synced_version` from here (cache hit). On a `GET /version` mismatch it pulls `/deltas?since=N`. **Long-poll** `/version/wait` keeps the cache warm so steady state is a local read (≈0 HTTP).
- **Fail open:** bus unreachable or slow (timeout ~1s) → fence returns `allow` and writes a warning to `.datum/warnings.log` (surfaced on the tower's fleet footer). **Never brick an agent.** RUBRIC: "fence fires with the arbiter disabled" — the arbiter is a *separate* async service; the fence depends only on the bus + this local state.

---

## 9. Sample data (verbatim — seed exactly this)

- Team `acme/workspaces`, feature "workspace invites", 3 sessions.
- Sessions: `asha` (data layer, `asha/schema`), `ben` (api, `ben/api`), `chen` (frontend, `chen/ui`).
- Contracts: `db.users` v8, `api.GET /users/:id` v3, `api.POST /invites` v1, `deps.db-driver` v2.
- Hero delta: `db.users` v7→v8 at **14:02:11**. `users.email` → `contact_email`, migration **0042**. why (asha): "phone signups make email the wrong name."
- Lifecycle timings (keep honest in any time-lapse): detected **0.3s**, ben's write fenced **5.8s**, advisories delivered **6.4s**, both reconciled by **14:03:40**, spec PR **#14** opened **14:04**.
- Ledger: `#112` 14:02 asha · rename users.email (phone signups landing); `#111` 13:41 chen · adopt zod for DTO parsing; `#110` 13:18 ben · invites API returns 202 + job id. **Seed loads `#110` + `#111` only** (ids inserted explicitly so the next auto-increment is 112); **`#112` is created live** when asha's delta is detected (bus-registry), and **spec-pr *links* it** (it does not re-create it via `POST /decide`).
- Metrics: deltas today **4**, writes fenced **3**, delta→fence **5.8s**, rework avoided **~412k tokens**.
- Claims (for the intersection): asha `{files:["migrations/**","schema.sql"], symbols:["users.email","users.contact_email"]}`; ben `{files:["routes/users.ts"], symbols:["user.email",".email"]}`; chen `{files:["UserCard.tsx"], symbols:["user.email","UserDTO.email"]}`.
