// server/sql-backend.ts — the tiny synchronous SQL backend the Store runs on.
//
// The load-bearing principle (ws2a-cloud-backend.md): one core, two transports.
// Store + registry + watchlist + fence + reconcile are backend-agnostic; they
// talk to SQL through this interface, never to a concrete driver. Two backends
// implement it:
//   - NodeSqliteBackend wraps node:sqlite DatabaseSync (the OSS self-hosted bus).
//   - DoSqliteBackend (later) wraps ctx.storage.sql (Datum Cloud).
// Same SQL, same schema, same behavior across both.

import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

/** A synchronous SQL backend. The only seam between the core and the driver. */
export interface SqlBackend {
  /** Run a query and return all rows (snake_case columns, 1:1 with §2). */
  all(sql: string, ...params: unknown[]): Record<string, unknown>[];
  /** Run a statement for its side effect. */
  run(sql: string, ...params: unknown[]): void;
  /** Execute one or more statements (schema bootstrap, pragmas). */
  exec(multiStatementSql: string): void;
}

/**
 * node:sqlite backed SqlBackend. Wraps a DatabaseSync; this is the only place in
 * the server that touches node:sqlite, so a DoSqliteBackend can swap in later.
 */
export class NodeSqliteBackend implements SqlBackend {
  private db: DatabaseSync;

  constructor(db: DatabaseSync) {
    this.db = db;
  }

  all(sql: string, ...params: unknown[]): Record<string, unknown>[] {
    return this.db.prepare(sql).all(...params) as Record<string, unknown>[];
  }

  run(sql: string, ...params: unknown[]): void {
    this.db.prepare(sql).run(...params);
  }

  exec(multiStatementSql: string): void {
    this.db.exec(multiStatementSql);
  }

  /** Close the underlying handle (OSS bus shutdown / test teardown). */
  close(): void {
    this.db.close();
  }
}

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

/**
 * Open (or create) the Datum database on disk and ensure the schema exists,
 * returning a NodeSqliteBackend. This is the OSS factory: file path, pragmas,
 * schema bootstrap, and the additive sessions migration all live here.
 * @param path ':memory:' for tests, default '.datum/datum.db'.
 */
export function openNodeSqliteBackend(path = ".datum/datum.db"): NodeSqliteBackend {
  if (path !== ":memory:") {
    mkdirSync(dirname(path), { recursive: true });
  }
  const db = new DatabaseSync(path);
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec(SCHEMA);
  migrateSessions(db);
  // Seed the epoch row once; never clobber an existing value.
  db.prepare(
    "INSERT OR IGNORE INTO meta (key, value) VALUES ('registry_version', '0')",
  ).run();
  return new NodeSqliteBackend(db);
}

/**
 * Additive migration (§10): older databases predate the sessions.workspace_id +
 * email columns. ADD COLUMN them if missing so a pre-team db keeps working. This
 * is idempotent — a fresh db already has them from SCHEMA, and PRAGMA
 * table_info tells us which to add.
 */
function migrateSessions(db: DatabaseSync): void {
  const cols = (db.prepare("PRAGMA table_info(sessions)").all() as Array<{ name: string }>).map(
    (c) => c.name,
  );
  if (!cols.includes("workspace_id")) {
    db.exec("ALTER TABLE sessions ADD COLUMN workspace_id TEXT NOT NULL DEFAULT ''");
  }
  if (!cols.includes("email")) {
    db.exec("ALTER TABLE sessions ADD COLUMN email TEXT NOT NULL DEFAULT ''");
  }
}
