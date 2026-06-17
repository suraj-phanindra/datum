// server/db.ts: open the OSS SQLite-backed Datum store.
//
// The SQLite driver and pragmas live in server/node-sqlite-backend.ts and the
// schema DDL in server/schema.ts so the core can run on a second transport (the
// Cloudflare Durable Object's ctx.storage.sql) unchanged. This file keeps the
// historical openDb/close surface for the OSS bus + tests, producing a
// NodeSqliteBackend (a SqlBackend), and re-exports SCHEMA_SQL for existing callers.
//
// In-process TS objects are camelCase; the wire/events are snake_case. The
// SQLite columns mirror the schema.md field names (snake_case) verbatim so a
// row read maps 1:1 to the on-the-wire shape.

import { NodeSqliteBackend, openNodeSqliteBackend } from "./node-sqlite-backend.ts";
import { SCHEMA_SQL } from "./schema.ts";

// The OSS store handle is a NodeSqliteBackend (a SqlBackend with close()).
export type Database = NodeSqliteBackend;

// Re-export SCHEMA_SQL (now defined node-free in server/schema.ts) so existing
// importers of "./db.ts" keep working unchanged.
export { SCHEMA_SQL };

/**
 * Open (or create) the Datum database and ensure the schema exists.
 * @param path ':memory:' for tests, default '.datum/datum.db'.
 */
export function openDb(path = ".datum/datum.db"): Database {
  return openNodeSqliteBackend(path);
}

/** Close the database handle. */
export function close(db: Database): void {
  db.close();
}
