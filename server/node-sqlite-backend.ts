// server/node-sqlite-backend.ts: the node:sqlite backed SqlBackend (OSS bus).
//
// This is the ONLY place in the server core that touches node:sqlite (plus
// node:fs/node:path for the on-disk file). It is deliberately quarantined here so
// the shared core (server/store.ts, server/sql-backend.ts, server/schema.ts) stays
// node-free and the Cloudflare Worker/DO bundle pulls in zero node built-ins. The
// DoSqliteBackend, in the Datum Cloud backend (a separate private repo), is the
// second transport and implements the same SqlBackend interface over ctx.storage.sql.

import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { SqlBackend } from "./sql-backend.ts";
import { SCHEMA_SQL } from "./schema.ts";

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
  db.exec(SCHEMA_SQL);
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
 * is idempotent (a fresh db already has them from SCHEMA), and PRAGMA
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
