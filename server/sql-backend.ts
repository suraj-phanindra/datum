// server/sql-backend.ts: the tiny synchronous SQL backend the Store runs on.
//
// The load-bearing principle (ws2a-cloud-backend.md): one core, two transports.
// Store + registry + watchlist + fence + reconcile are backend-agnostic; they
// talk to SQL through this interface, never to a concrete driver. Two backends
// implement it:
//   - NodeSqliteBackend wraps node:sqlite DatabaseSync (server/node-sqlite-backend.ts,
//     the OSS self-hosted bus).
//   - DoSqliteBackend (cloud/src/do-sqlite-backend.ts) wraps ctx.storage.sql (Datum Cloud).
// Same SQL, same schema, same behavior across both.
//
// This file is node-free by design: it imports NOTHING, so the cloud bundle pulls
// in zero node built-ins through it. The node:sqlite driver lives only in
// server/node-sqlite-backend.ts.

/** A synchronous SQL backend. The only seam between the core and the driver. */
export interface SqlBackend {
  /** Run a query and return all rows (snake_case columns, 1:1 with §2). */
  all(sql: string, ...params: unknown[]): Record<string, unknown>[];
  /** Run a statement for its side effect. */
  run(sql: string, ...params: unknown[]): void;
  /** Execute one or more statements (schema bootstrap, pragmas). */
  exec(multiStatementSql: string): void;
}
