// server/schema.ts: the canonical Datum schema DDL (§2), as one node-free string.
//
// This file imports NOTHING. It is the node-free leaf both transports share: the
// OSS NodeSqliteBackend bootstraps it on open (server/node-sqlite-backend.ts), and
// the Cloudflare WorkspaceBus Durable Object runs it through ctx.storage.sql in
// blockConcurrencyWhile. It is a plain template string with zero node imports, so
// it is safe to import into a Worker. Every statement is IF NOT EXISTS so the
// bootstrap is idempotent across both backends.

/**
 * SCHEMA_SQL: the canonical Datum schema DDL (§2), as one node-free string.
 */
export const SCHEMA_SQL = `
-- contracts: the current truth, one row per contract (§2)
CREATE TABLE IF NOT EXISTS contracts (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  type            TEXT NOT NULL,            -- ContractType
  current_version INTEGER NOT NULL,         -- per-contract monotonic int
  current_value   TEXT NOT NULL             -- JSON snapshot
);

-- contract_versions: append-only history, one row per (contract, version) (§2)
CREATE TABLE IF NOT EXISTS contract_versions (
  contract_id      TEXT NOT NULL,
  version          INTEGER NOT NULL,        -- per-contract version
  epoch            INTEGER NOT NULL,        -- global registry_version at landing
  author           TEXT NOT NULL,
  ts               TEXT NOT NULL,           -- ISO 8601
  why              TEXT NOT NULL,
  mechanical_change TEXT NOT NULL,          -- JSON MechanicalChange
  value_snapshot   TEXT NOT NULL,           -- JSON snapshot
  PRIMARY KEY (contract_id, version)
);

-- ledger: append-only decision history. id auto-increments but explicit ids are
-- allowed for seeding (#110/#111) so the next auto id is 112 (§9). (§2)
CREATE TABLE IF NOT EXISTS ledger (
  id          INTEGER PRIMARY KEY,          -- AUTOINCREMENT semantics via INTEGER PK
  ts          TEXT NOT NULL,
  author      TEXT NOT NULL,
  description TEXT NOT NULL,
  contract_id TEXT                          -- optional link
);

-- sessions: a human + their agent, as one unit (§2 + §10).
-- workspace_id + email are the additive team columns (§10): OPTIONAL, defaulted,
-- so a pre-team db migrates cleanly (see migrateSessions below).
CREATE TABLE IF NOT EXISTS sessions (
  id                  TEXT PRIMARY KEY,
  human               TEXT NOT NULL,
  branch              TEXT NOT NULL,
  claim_files         TEXT NOT NULL,        -- JSON string[]
  claim_symbols       TEXT NOT NULL,        -- JSON string[]
  last_synced_version INTEGER NOT NULL,
  status              TEXT NOT NULL,        -- live|fenced|reconciling|reconciled|idle
  workspace_id        TEXT NOT NULL DEFAULT '',  -- §10 the team key (host/owner/repo)
  email               TEXT NOT NULL DEFAULT ''   -- §10 git-native identity
);

-- events: the append-only bus log, source of truth for replay + tower (§2)
CREATE TABLE IF NOT EXISTS events (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  type    TEXT NOT NULL,
  payload TEXT NOT NULL,                    -- JSON
  ts      TEXT NOT NULL
);

-- meta: single-row global state, holds the registry_version epoch (§1)
CREATE TABLE IF NOT EXISTS meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;
