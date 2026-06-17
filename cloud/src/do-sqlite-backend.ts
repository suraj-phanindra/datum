// cloud/src/do-sqlite-backend.ts — the Cloudflare transport for the SqlBackend.
//
// One core, two transports (ws2a-cloud-backend.md). The OSS bus runs the Store
// over a NodeSqliteBackend (node:sqlite); Datum Cloud runs the IDENTICAL Store
// over this DoSqliteBackend, which wraps a Durable Object's SqlStorage
// (ctx.storage.sql). Same SQL, same schema, same registry/version/fence/
// reconcile behavior — the only difference is which synchronous SQLite engine
// executes the statements.
//
// SqlBackend is imported TYPE-ONLY so the node:sqlite-backed NodeSqliteBackend
// in server/sql-backend.ts is never pulled into the Worker bundle. The contract
// is the interface, not the OSS implementation.

import type { SqlBackend } from "../../server/sql-backend.ts";

/**
 * SqlStorage is the DO's synchronous SQLite handle (ctx.storage.sql). exec()
 * returns a cursor with toArray()/one()/raw(); it accepts ;-separated multi
 * statements (used for the SCHEMA_SQL bootstrap). Typed locally so this file
 * needs no @cloudflare/workers-types import to compile against the interface.
 */
interface SqlStorageCursor {
  toArray(): Record<string, unknown>[];
}
interface SqlStorage {
  exec(query: string, ...bindings: unknown[]): SqlStorageCursor;
}

/**
 * DoSqliteBackend — a SqlBackend over a Durable Object's SqlStorage.
 *
 * Mirrors NodeSqliteBackend one-for-one:
 *   all  -> exec(...).toArray()  (rows as snake_case Record<string, unknown>[])
 *   run  -> exec(...)            (statement for its side effect, cursor discarded)
 *   exec -> exec(multi)          (schema bootstrap / multi-statement DDL)
 * ctx.storage.sql.exec is synchronous, so the Store stays synchronous on Cloud.
 */
export class DoSqliteBackend implements SqlBackend {
  constructor(private sql: SqlStorage) {}

  all(q: string, ...p: unknown[]): Record<string, unknown>[] {
    return this.sql.exec(q, ...p).toArray() as Record<string, unknown>[];
  }

  run(q: string, ...p: unknown[]): void {
    this.sql.exec(q, ...p);
  }

  exec(multi: string): void {
    this.sql.exec(multi);
  }
}
