// server/index.ts — public entry point for the bus + registry substrate.
//
// startBus({ port, dbPath }) starts the HTTP bus and returns { url, close }.
// Default port from DATUM_BUS_URL or 4317. Runnable directly via
//   node server/index.ts
// No model touches this path.

import { createBus, type BusHandle, type StartOptions } from "./bus.ts";
import { runAsEntry } from "./entry.ts";

export type { BusHandle, StartOptions } from "./bus.ts";
export { Store } from "./store.ts";
export type {
  Contract,
  ContractType,
  ContractVersion,
  LedgerEntry,
  Session,
  SessionStatus,
  Event,
  EventType,
  MechanicalChange,
  Delta,
} from "./store.ts";
export { classifyEdit, bumpRegistry, referencesStaleSymbol } from "./watchlist.ts";
export type { ClassifyResult } from "./watchlist.ts";
export { applyEdit, intersectingSessions } from "./registry.ts";
export { Reconciler } from "./reconcile.ts";
export { openDb, close as closeDb } from "./db.ts";

/** Resolve the default port from DATUM_BUS_URL (e.g. http://127.0.0.1:4317). */
function defaultPort(): number {
  const url = process.env.DATUM_BUS_URL;
  if (url) {
    try {
      const p = new URL(url).port;
      if (p) return Number(p);
    } catch {
      /* ignore malformed env */
    }
  }
  return 4317;
}

export type StartBusResult = { url: string; port: number; close: () => Promise<void> };

/**
 * Start the bus. With no port, uses DATUM_BUS_URL's port or 4317. Pass port: 0
 * for an ephemeral port (tests). dbPath defaults to .datum/datum.db; pass
 * ':memory:' for isolated tests.
 */
export async function startBus(opts: StartOptions = {}): Promise<StartBusResult> {
  const port = opts.port ?? defaultPort();
  const handle: BusHandle = await createBus({ port, dbPath: opts.dbPath });
  return { url: handle.url, port: handle.port, close: handle.close };
}

// Run directly: `node server/index.ts` (dev) or `node dist/server.js` (dist).
const isMain = runAsEntry(import.meta.url, "server");

if (isMain) {
  startBus()
    .then((bus) => {
      // eslint-disable-next-line no-console
      console.log(`datum bus listening on ${bus.url}`);
      const shutdown = () => {
        bus.close().then(() => process.exit(0));
      };
      process.on("SIGINT", shutdown);
      process.on("SIGTERM", shutdown);
    })
    .catch((err) => {
      // eslint-disable-next-line no-console
      console.error("failed to start datum bus:", err);
      process.exit(1);
    });
}
