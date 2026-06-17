// server/router.ts — the transport-agnostic request/response router.
//
// This is the single source of truth for every NON-STREAMING bus endpoint
// (schema §4). It runs the exact same Store / registry / reconcile calls the
// node:http bus ran inline, but returns a plain BusResult instead of writing to
// a ServerResponse. The same routeBus() backs both the OSS node:http server
// (server/bus.ts) and the Cloudflare WorkspaceBus Durable Object (Cloud).
//
// The STREAMING + transport-specific parts stay out of here: GET /stream (SSE /
// WebSocket fan-out), GET /version/wait (long-poll), the SSE client set, the
// version-waiter wakeups, and the http/DO server itself. The transport reads
// `broadcast` (events to fan out to stream subscribers) and `versionBumped` (to
// wake version waiters / enqueue the arbiter) off the result and performs those
// side effects.
//
// No model touches this path.

import { Store, type Event, type EventType, type Session } from "./store.ts";
import { applyEdit, deltaToPayload, type StreamedEdit } from "./registry.ts";
import { Reconciler } from "./reconcile.ts";

/** A normalized request the transport hands to routeBus. */
export interface BusRequest {
  method: string;
  path: string;
  query: URLSearchParams;
  body: unknown;
}

/**
 * A broadcastable bus event. `type` + `payload` are the minimum the transport
 * needs to fan out; `id` + `ts` carry through the real appended-event identity
 * so the SSE / WebSocket frame is byte-identical to the inline bus (watchers
 * de-dupe by `id`). Both are present on every broadcast routeBus emits.
 */
export interface BusBroadcast {
  type: string;
  payload: unknown;
  id?: number;
  ts?: string;
}

/**
 * The result of routing a request. `status` + `body` are the HTTP response.
 * `broadcast` is the ordered list of events the transport must fan out to
 * stream subscribers (already appended to the events table by routeBus).
 * `versionBumped` tells the transport to wake /version/wait long-pollers and
 * enqueue the arbiter.
 */
export interface BusResult {
  status: number;
  body: unknown;
  broadcast?: BusBroadcast[];
  versionBumped?: boolean;
}

/**
 * routeBus — the deterministic, transport-agnostic router for all
 * non-streaming endpoints. Same Store/registry/reconcile calls and the same
 * response JSON shapes as the inline bus handler; the transport owns the SSE /
 * WebSocket frames, the long-poll, and the version-waiter wakeups.
 */
export function routeBus(store: Store, reconciler: Reconciler, req: BusRequest): BusResult {
  const { method, path, query } = req;

  // ---- GET /healthz ----
  if (method === "GET" && path === "/healthz") {
    return { status: 200, body: { ok: true } };
  }

  // ---- GET /version ----
  if (method === "GET" && path === "/version") {
    return { status: 200, body: { registry_version: store.getVersion() } };
  }

  // ---- GET /registry ----
  if (method === "GET" && path === "/registry") {
    return {
      status: 200,
      body: {
        registry_version: store.getVersion(),
        contracts: store.listContracts(),
      },
    };
  }

  // ---- GET /sessions (live roster — read-only; cockpit status uses it) ----
  if (method === "GET" && path === "/sessions") {
    return { status: 200, body: { sessions: store.listSessions() } };
  }

  // ---- GET /events?since=N (the bus log; cockpit log/ledger uses it) ----
  if (method === "GET" && path === "/events") {
    const since = numParam(query, "since", 0);
    return { status: 200, body: { events: store.getEventsSince(since) } };
  }

  // ---- GET /ledger (decision history for `datum log`) ----
  if (method === "GET" && path === "/ledger") {
    return { status: 200, body: { ledger: store.listLedger() } };
  }

  // ---- GET /contracts/:id/versions (history for `datum show`/`datum diff`) ----
  const verMatch = /^\/contracts\/(.+)\/versions$/.exec(path);
  if (method === "GET" && verMatch) {
    const cid = decodeURIComponent(verMatch[1]);
    return {
      status: 200,
      body: {
        contract: store.getContract(cid) ?? null,
        versions: store.listContractVersions(cid),
      },
    };
  }

  // ---- GET /deltas?since=N ----
  if (method === "GET" && path === "/deltas") {
    const since = numParam(query, "since", 0);
    return { status: 200, body: { deltas: store.getDeltasSince(since) } };
  }

  // ---- GET /sessions/:id/advisories ----
  const advMatch = /^\/sessions\/([^/]+)\/advisories$/.exec(path);
  if (method === "GET" && advMatch) {
    const sid = decodeURIComponent(advMatch[1]);
    const advisories = advisoriesFor(store, sid);
    return { status: 200, body: { advisories } };
  }

  // ---- POST /sessions ----
  if (method === "POST" && path === "/sessions") {
    const body = asRecord(req.body);
    const broadcast: BusBroadcast[] = [];
    const sessionWorkspace = String(body.workspace_id ?? "");
    const session: Session = {
      id: String(body.session_id ?? body.id ?? ""),
      human: String(body.human ?? ""),
      email: String(body.email ?? ""),
      branch: String(body.branch ?? ""),
      workspace_id: sessionWorkspace,
      claim_files: asStringArray(body.claim_files),
      claim_symbols: asStringArray(body.claim_symbols),
      last_synced_version: store.getVersion(),
      status: "live",
    };
    store.upsertSession(session);

    // §10: the bus is single-registry per team. Adopt the first workspace_id it
    // sees; warn (never block) a session that joins with a DIFFERENT one.
    const served = store.adoptWorkspace(sessionWorkspace);
    let warning: string | undefined;
    if (sessionWorkspace && served && sessionWorkspace !== served) {
      warning = `this bus serves ${served}, you are in ${sessionWorkspace}`;
    }

    const joined = store.addEvent("session.joined", {
      session_id: session.id,
      human: session.human,
      email: session.email,
      branch: session.branch,
      workspace_id: session.workspace_id,
      claim_files: session.claim_files,
      claim_symbols: session.claim_symbols,
      registry_version: store.getVersion(),
    });
    broadcast.push(toBroadcast(joined));
    const claim = store.addEvent("claim.published", {
      session_id: session.id,
      human: session.human,
      claim_files: session.claim_files,
      claim_symbols: session.claim_symbols,
    });
    broadcast.push(toBroadcast(claim));
    const advisories = advisoriesFor(store, session.id);
    return {
      status: 200,
      body: {
        registry_version: store.getVersion(),
        workspace_id: served,
        snapshot: { registry_version: store.getVersion(), contracts: store.listContracts() },
        advisories,
        ...(warning ? { warning } : {}),
      },
      broadcast,
    };
  }

  // ---- PATCH /sessions/:id ----
  const patchMatch = /^\/sessions\/([^/]+)$/.exec(path);
  if (method === "PATCH" && patchMatch) {
    const sid = decodeURIComponent(patchMatch[1]);
    const body = asRecord(req.body);
    const patch: Partial<Omit<Session, "id">> = {};
    if (body.human != null) patch.human = String(body.human);
    if (body.email != null) patch.email = String(body.email);
    if (body.branch != null) patch.branch = String(body.branch);
    if (body.workspace_id != null) patch.workspace_id = String(body.workspace_id);
    if (body.claim_files != null) patch.claim_files = asStringArray(body.claim_files);
    if (body.claim_symbols != null) patch.claim_symbols = asStringArray(body.claim_symbols);
    if (body.last_synced_version != null) patch.last_synced_version = Number(body.last_synced_version);
    if (body.status != null) patch.status = body.status as Session["status"];

    const updated = store.patchSession(sid, patch);
    if (!updated) {
      // fail open: register a thin session if it didn't exist yet.
      return { status: 200, body: { ok: false, registry_version: store.getVersion() } };
    }
    const broadcast: BusBroadcast[] = [];
    if (patch.claim_files != null || patch.claim_symbols != null) {
      const claim = store.addEvent("claim.published", {
        session_id: updated.id,
        human: updated.human,
        claim_files: updated.claim_files,
        claim_symbols: updated.claim_symbols,
      });
      broadcast.push(toBroadcast(claim));
    }
    return { status: 200, body: { ok: true, registry_version: store.getVersion() }, broadcast };
  }

  // ---- POST /events ----
  if (method === "POST" && path === "/events") {
    const body = asRecord(req.body);
    const type = String(body.type ?? "edit.streamed") as EventType;
    const payload = (body.payload ?? body) as Record<string, unknown>;
    const broadcast: BusBroadcast[] = [];
    let versionBumped = false;

    // 1) append the raw event to the bus log + broadcast it.
    const raw = store.addEvent(type, payload);
    broadcast.push(toBroadcast(raw));

    let delta;
    // 2) only an edit.streamed runs the watchlist parse / may bump.
    if (type === "edit.streamed") {
      const edit = payload as StreamedEdit;
      const beforeEpoch = store.getVersion();
      const result = applyEdit(store, edit);
      delta = result.delta;

      if (delta) {
        // broadcast the delta.detected event applyEdit appended.
        const deltaEvents = store
          .getEventsSince(raw.id)
          .filter((e) => e.type === "delta.detected");
        for (const de of deltaEvents) broadcast.push(toBroadcast(de));
        // register fence tracking for intersecting consumers.
        reconciler.onDelta(delta);
      }

      if (store.getVersion() > beforeEpoch) versionBumped = true;

      // 3) reconcile path: a clean write from a previously-fenced session.
      const sessionId = String(edit.session_id ?? "");
      if (sessionId) {
        const content = String(edit.after ?? edit.content ?? edit.summary ?? "");
        const recEvents = reconciler.onEdit({
          sessionId,
          human: edit.human,
          path: edit.path,
          content,
        });
        for (const re of recEvents) broadcast.push(toBroadcast(re));
      }
    }

    return {
      status: 200,
      body: {
        ok: true,
        registry_version: store.getVersion(),
        ...(delta ? { delta: deltaToPayload(delta) } : {}),
      },
      broadcast,
      versionBumped,
    };
  }

  // ---- POST /decide (epoch-NEUTRAL) ----
  if (method === "POST" && path === "/decide") {
    const body = asRecord(req.body);
    const author = String(body.author ?? "");
    const description = String(body.description ?? "");
    const contract = body.contract != null ? String(body.contract) : undefined;
    const ledgerId = store.addLedger({
      ts: new Date().toISOString(),
      author,
      description,
      contract_id: contract,
    });
    // epoch unchanged; return the CURRENT registry_version.
    return {
      status: 200,
      body: {
        ledger_id: ledgerId,
        registry_version: store.getVersion(),
      },
    };
  }

  // ---- not found ----
  return { status: 404, body: { ok: false, error: "not found" } };
}

// ---- helpers ----

/** Carry the full appended event (id + ts included) onto the broadcast list. */
function toBroadcast(ev: Event): BusBroadcast {
  return { id: ev.id, type: ev.type, payload: ev.payload, ts: ev.ts };
}

/** Advisories delivered to a session, newest order preserved (shared by two routes). */
function advisoriesFor(store: Store, sessionId: string): unknown[] {
  return store
    .getEventsSince(0)
    .filter(
      (e) =>
        e.type === "advisory.delivered" &&
        (e.payload as { session_id?: string }).session_id === sessionId,
    )
    .map((e) => (e.payload as { advisory?: unknown }).advisory ?? e.payload);
}

function asRecord(body: unknown): Record<string, unknown> {
  if (body && typeof body === "object" && !Array.isArray(body)) {
    return body as Record<string, unknown>;
  }
  return {};
}

function numParam(query: URLSearchParams, key: string, fallback: number): number {
  const v = query.get(key);
  if (v == null) return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function asStringArray(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(String);
  if (typeof v === "string" && v.length > 0) {
    try {
      const parsed = JSON.parse(v);
      if (Array.isArray(parsed)) return parsed.map(String);
    } catch {
      return [v];
    }
  }
  return [];
}
