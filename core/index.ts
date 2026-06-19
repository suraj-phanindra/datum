// @datum/core — the coordination core, re-exported for bundler-based (esbuild)
// consumers. Ships TypeScript source: server/ is mirrored into ./server by
// scripts/build-core.mjs, so every import below resolves inside the package.
//
// server/ in the public repo is the single source of truth; this surface re-exports
// its public API so a separate private repo (the Cloudflare cloud plane) can depend
// on @datum/core instead of reaching across a repo boundary into ../../server/*.

// ---- store: the typed CRUD core + the §2 data model types ----
export { Store } from "./server/store.ts";
export type {
  Contract,
  ContractType,
  ContractVersion,
  Delta,
  Session,
  SessionStatus,
  LedgerEntry,
  Event,
  EventType,
  MechanicalChange,
} from "./server/store.ts";

// ---- reconcile: server-owned live `reconciled` emission ----
export { Reconciler } from "./server/reconcile.ts";

// ---- router: the transport-agnostic non-streaming bus router ----
export { routeBus } from "./server/router.ts";
export type { BusRequest, BusResult, BusBroadcast } from "./server/router.ts";

// ---- schema: the canonical node-free DDL string ----
export { SCHEMA_SQL } from "./server/schema.ts";

// ---- sql-backend: the synchronous SQL seam between core and driver ----
export type { SqlBackend } from "./server/sql-backend.ts";

// ---- registry: streamed-edit -> versioned delta + claim intersection ----
export { applyEdit, intersectingSessions, deltaToPayload } from "./server/registry.ts";
export type { StreamedEdit, ApplyEditResult } from "./server/registry.ts";

// ---- watchlist: the deterministic contract-surface parser ----
export { classifyEdit, bumpRegistry, referencesStaleSymbol } from "./server/watchlist.ts";
export type { ClassifyResult } from "./server/watchlist.ts";

// ---- fence: the deterministic PreToolUse decision (pure) ----
export { decideFence } from "./server/fence.ts";
export type { FenceInput, FenceDecision } from "./server/fence.ts";

// ---- arbiter/intersect: the deterministic recipient set for the arbiter ----
export { intersect } from "./server/arbiter/intersect.ts";

// ---- arbiter/advise: turn a (delta, recipient) pair into an Advisory ----
export { advise } from "./server/arbiter/advise.ts";
export type { ModelClient, Advisory, Severity, DeltaRef } from "./server/arbiter/advise.ts";

// ---- arbiter/prompt: build the per-recipient Anthropic Messages request ----
export { buildPrompt } from "./server/arbiter/prompt.ts";
export type { PromptPayload, TextBlock, MessageParam } from "./server/arbiter/prompt.ts";
