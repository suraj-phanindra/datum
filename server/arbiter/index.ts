// server/arbiter/index.ts — the arbiter orchestrator (off the critical path).
//
// runArbiter(store, delta, {modelClient?}):
//   1. compute the deterministic recipient set (intersectingSessions; author
//      excluded) from the store's live sessions,
//   2. call advise() once per intersecting pair (delta + that session) to get a
//      tailored Advisory each,
//   3. append one `advisory.delivered` event per recipient to the store/bus,
//   4. return the advisories.
//
// This is ASYNC and OFF the critical path: the deterministic fence + version
// bump never wait on it, and it is NEVER called from the fence. The demo passes
// with the arbiter disabled (the model stays off the fence path entirely).

import type { Store, Delta } from "../store.ts";
import { intersect } from "./intersect.ts";
import { advise } from "./advise.ts";
import type { Advisory, ModelClient } from "./advise.ts";

export type RunArbiterOptions = {
  modelClient?: ModelClient;
};

/**
 * runArbiter — fan out advisories for a delta to every intersecting recipient,
 * append an `advisory.delivered` event per recipient, and return the
 * advisories. Recipients are deterministic + author-excluded; advisory prose is
 * the only model-driven part.
 */
export async function runArbiter(
  store: Store,
  delta: Delta,
  opts: RunArbiterOptions = {},
): Promise<Advisory[]> {
  const sessions = store.listSessions();
  const recipients = intersect(delta, sessions);

  // advise() per pair. Run sequentially-collected (Promise.all) — they share
  // the cached prefix, so concurrency is fine; the canonical recipient ORDER is
  // preserved by mapping over the deterministic recipient list.
  const advisories = await Promise.all(
    recipients.map((session) => advise(delta, session, opts.modelClient)),
  );

  // one advisory.delivered event per recipient (schema §3 payload shape:
  // { session_id, human, recipient, file, advisory }).
  for (const advisory of advisories) {
    store.addEvent("advisory.delivered", {
      session_id: advisory.session_id,
      human: advisory.recipient,
      recipient: advisory.recipient,
      file: advisory.file,
      advisory,
    });
  }

  return advisories;
}

// re-export the surface so callers import everything from the arbiter index.
export { advise, defaultModelClient } from "./advise.ts";
export type { Advisory, ModelClient, Severity, DeltaRef } from "./advise.ts";
export { intersect, intersectingSessions } from "./intersect.ts";
export { buildPrompt } from "./prompt.ts";
