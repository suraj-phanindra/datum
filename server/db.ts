// server/db.ts — open a SQLite database (node:sqlite, zero-install) and create
// the 5 tables per schema.md §2. Synchronous throughout (DatabaseSync).
//
// In-process TS objects are camelCase; the wire/events are snake_case. The
// SQLite columns mirror the schema.md field names (snake_case) verbatim so a
// row read maps 1:1 to the on-the-wire shape.

import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

export type Database = DatabaseSync;

const SCHEMA = `
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

-- sessions: a human + their agent, as one unit (§2)
CREATE TABLE IF NOT EXISTS sessions (
  id                  TEXT PRIMARY KEY,
  human               TEXT NOT NULL,
  branch              TEXT NOT NULL,
  claim_files         TEXT NOT NULL,        -- JSON string[]
  claim_symbols       TEXT NOT NULL,        -- JSON string[]
  last_synced_version INTEGER NOT NULL,
  status              TEXT NOT NULL         -- live|fenced|reconciling|reconciled|idle
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

/**
 * Open (or create) the Datum database and ensure the schema exists.
 * @param path ':memory:' for tests, default '.datum/datum.db'.
 */
export function openDb(path = ".datum/datum.db"): Database {
  if (path !== ":memory:") {
    mkdirSync(dirname(path), { recursive: true });
  }
  const db = new DatabaseSync(path);
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec(SCHEMA);
  // Seed the epoch row once; never clobber an existing value.
  db.prepare(
    "INSERT OR IGNORE INTO meta (key, value) VALUES ('registry_version', '0')",
  ).run();
  return db;
}

/** Close the database handle. */
export function close(db: Database): void {
  db.close();
}
