// cloud/src/index.ts: the Datum Cloud Worker entry point.
//
// Wires the two halves of the hosted layer together for wrangler:
//   - fetch: the edge Worker router (auth + workspace_id -> WorkspaceBus DO),
//   - queue: the off-critical-path arbiter consumer (advise + spec PR),
// and re-exports the WorkspaceBus Durable Object class so the runtime can bind it.
//
// This module pulls in only the node-free server core transitively (the schema
// string, the Store over a SqlBackend interface, the arbiter's node-free advise),
// so the bundle contains zero node built-ins.

export { WorkspaceBus } from "./workspace-bus.ts";

import { handleFetch } from "./worker.ts";
import { handleQueue } from "./arbiter-consumer.ts";

export default {
  fetch: handleFetch,
  queue: handleQueue,
};
