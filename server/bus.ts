// server/bus.ts — the node:http bus + registry server. Exposes every schema §4
// endpoint, appends every posted event to the events table (source of truth),
// and broadcasts events to SSE subscribers. JSON in/out. Fail open.
//
// No model touches this path.

import { createServer, type IncomingMessage, type ServerResponse, type Server } from "node:http";
import { URL } from "node:url";
import { openDb, close as closeDb, type Database } from "./db.ts";
import { Store, type Event, type Session, type EventType } from "./store.ts";
import { applyEdit, deltaToPayload, type StreamedEdit } from "./registry.ts";
import { Reconciler } from "./reconcile.ts";

export type BusHandle = {
  url: string;
  port: number;
  host: string; // the bind host (127.0.0.1 by default, 0.0.0.0 when --public)
  server: Server;
  store: Store;
  db: Database;
  close: () => Promise<void>;
};

type SseClient = { id: number; res: ServerResponse };

export type StartOptions = { port?: number; dbPath?: string; host?: string };

/**
 * Build and start the bus server. Returns a handle with the resolved url + a
 * close() that tears down SSE clients, the http server, and the db.
 */
export function createBus(opts: StartOptions = {}): Promise<BusHandle> {
  const dbPath = opts.dbPath ?? ".datum/datum.db";
  const db = openDb(dbPath);
  const store = new Store(db);
  const reconciler = new Reconciler(store);

  const sseClients = new Set<SseClient>();
  let sseSeq = 0;
  // long-poll waiters on /version/wait, resolved on any epoch bump.
  const versionWaiters = new Set<() => void>();

  function broadcast(ev: Event): void {
    const frame = `id: ${ev.id}\nevent: ${ev.type}\ndata: ${JSON.stringify(ev)}\n\n`;
    for (const c of sseClients) {
      try {
        c.res.write(frame);
      } catch {
        // drop broken clients silently (fail open)
      }
    }
  }

  function wakeVersionWaiters(): void {
    for (const w of [...versionWaiters]) w();
  }

  const server = createServer((req, res) => {
    handle(req, res).catch((err) => {
      // fail open: never crash the bus on a single bad request.
      sendJson(res, 500, { ok: false, error: String(err && (err as Error).message) });
    });
  });

  async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const method = req.method ?? "GET";
    const u = new URL(req.url ?? "/", "http://127.0.0.1");
    const path = u.pathname;

    // ---- GET /healthz ----
    if (method === "GET" && path === "/healthz") {
      return sendJson(res, 200, { ok: true });
    }

    // ---- GET /version ----
    if (method === "GET" && path === "/version") {
      return sendJson(res, 200, { registry_version: store.getVersion() });
    }

    // ---- GET /version/wait?since=N&timeout=ms ----
    if (method === "GET" && path === "/version/wait") {
      const since = numParam(u, "since", store.getVersion());
      const timeout = numParam(u, "timeout", 25000);
      const current = store.getVersion();
      if (current > since) {
        return sendJson(res, 200, { registry_version: current, changed: true });
      }
      // long-poll: resolve on bump or timeout.
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        versionWaiters.delete(waiter);
        clearTimeout(timer);
        sendJson(res, 200, {
          registry_version: store.getVersion(),
          changed: store.getVersion() > since,
        });
      };
      const waiter = () => finish();
      const timer = setTimeout(finish, Math.max(0, timeout));
      versionWaiters.add(waiter);
      req.on("close", () => {
        done = true;
        versionWaiters.delete(waiter);
        clearTimeout(timer);
      });
      return;
    }

    // ---- GET /registry ----
    if (method === "GET" && path === "/registry") {
      return sendJson(res, 200, {
        registry_version: store.getVersion(),
        contracts: store.listContracts(),
      });
    }

    // ---- GET /sessions (live roster — read-only; cockpit status uses it) ----
    if (method === "GET" && path === "/sessions") {
      return sendJson(res, 200, { sessions: store.listSessions() });
    }

    // ---- GET /events?since=N (the bus log; cockpit log/ledger uses it) ----
    if (method === "GET" && path === "/events") {
      const since = numParam(u, "since", 0);
      return sendJson(res, 200, { events: store.getEventsSince(since) });
    }

    // ---- GET /ledger (decision history for `datum log`) ----
    if (method === "GET" && path === "/ledger") {
      return sendJson(res, 200, { ledger: store.listLedger() });
    }

    // ---- GET /contracts/:id/versions (history for `datum show`/`datum diff`) ----
    const verMatch = /^\/contracts\/(.+)\/versions$/.exec(path);
    if (method === "GET" && verMatch) {
      const cid = decodeURIComponent(verMatch[1]);
      return sendJson(res, 200, {
        contract: store.getContract(cid) ?? null,
        versions: store.listContractVersions(cid),
      });
    }

    // ---- GET /deltas?since=N ----
    if (method === "GET" && path === "/deltas") {
      const since = numParam(u, "since", 0);
      return sendJson(res, 200, { deltas: store.getDeltasSince(since) });
    }

    // ---- GET /stream (SSE) ----
    if (method === "GET" && path === "/stream") {
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      });
      res.write(`retry: 1000\n\n`);
      const client: SseClient = { id: ++sseSeq, res };
      sseClients.add(client);
      req.on("close", () => sseClients.delete(client));
      return;
    }

    // ---- GET /sessions/:id/advisories ----
    const advMatch = /^\/sessions\/([^/]+)\/advisories$/.exec(path);
    if (method === "GET" && advMatch) {
      const sid = decodeURIComponent(advMatch[1]);
      const advisories = store
        .getEventsSince(0)
        .filter(
          (e) =>
            e.type === "advisory.delivered" &&
            (e.payload as { session_id?: string }).session_id === sid,
        )
        .map((e) => (e.payload as { advisory?: unknown }).advisory ?? e.payload);
      return sendJson(res, 200, { advisories });
    }

    // ---- POST /sessions ----
    if (method === "POST" && path === "/sessions") {
      const body = await readJson(req);
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
      broadcast(joined);
      const claim = store.addEvent("claim.published", {
        session_id: session.id,
        human: session.human,
        claim_files: session.claim_files,
        claim_symbols: session.claim_symbols,
      });
      broadcast(claim);
      const advisories = store
        .getEventsSince(0)
        .filter(
          (e) =>
            e.type === "advisory.delivered" &&
            (e.payload as { session_id?: string }).session_id === session.id,
        )
        .map((e) => (e.payload as { advisory?: unknown }).advisory ?? e.payload);
      return sendJson(res, 200, {
        registry_version: store.getVersion(),
        workspace_id: served,
        snapshot: { registry_version: store.getVersion(), contracts: store.listContracts() },
        advisories,
        ...(warning ? { warning } : {}),
      });
    }

    // ---- PATCH /sessions/:id ----
    const patchMatch = /^\/sessions\/([^/]+)$/.exec(path);
    if (method === "PATCH" && patchMatch) {
      const sid = decodeURIComponent(patchMatch[1]);
      const body = await readJson(req);
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
        return sendJson(res, 200, { ok: false, registry_version: store.getVersion() });
      }
      if (patch.claim_files != null || patch.claim_symbols != null) {
        const claim = store.addEvent("claim.published", {
          session_id: updated.id,
          human: updated.human,
          claim_files: updated.claim_files,
          claim_symbols: updated.claim_symbols,
        });
        broadcast(claim);
      }
      return sendJson(res, 200, { ok: true, registry_version: store.getVersion() });
    }

    // ---- POST /events ----
    if (method === "POST" && path === "/events") {
      const body = await readJson(req);
      const type = String(body.type ?? "edit.streamed") as EventType;
      const payload = (body.payload ?? body) as Record<string, unknown>;

      // 1) append the raw event to the bus log + broadcast it.
      const raw = store.addEvent(type, payload);
      broadcast(raw);

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
          for (const de of deltaEvents) broadcast(de);
          // register fence tracking for intersecting consumers.
          reconciler.onDelta(delta);
        }

        if (store.getVersion() > beforeEpoch) wakeVersionWaiters();

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
          for (const re of recEvents) broadcast(re);
        }
      }

      return sendJson(res, 200, {
        ok: true,
        registry_version: store.getVersion(),
        ...(delta ? { delta: deltaToPayload(delta) } : {}),
      });
    }

    // ---- POST /decide (epoch-NEUTRAL) ----
    if (method === "POST" && path === "/decide") {
      const body = await readJson(req);
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
      return sendJson(res, 200, {
        ledger_id: ledgerId,
        registry_version: store.getVersion(),
      });
    }

    // ---- not found ----
    return sendJson(res, 404, { ok: false, error: "not found" });
  }

  return new Promise<BusHandle>((resolve) => {
    const port = opts.port ?? 0;
    // §10: bind 127.0.0.1 by default; --host 0.0.0.0 (or any host) for a shared /
    // tunneled bus. The advertised url uses 127.0.0.1 when bound to a wildcard so
    // a local probe (healthz) still resolves; the bind hint is printed by serve.
    const host = opts.host || "127.0.0.1";
    server.listen(port, host, () => {
      const addr = server.address();
      const resolvedPort = typeof addr === "object" && addr ? addr.port : Number(port);
      const advertiseHost = host === "0.0.0.0" || host === "::" ? "127.0.0.1" : host;
      const url = `http://${advertiseHost}:${resolvedPort}`;
      resolve({
        url,
        port: resolvedPort,
        host,
        server,
        store,
        db,
        close: () =>
          new Promise<void>((res) => {
            for (const c of sseClients) {
              try {
                c.res.end();
              } catch {
                /* ignore */
              }
            }
            sseClients.clear();
            for (const w of versionWaiters) w();
            versionWaiters.clear();
            server.close(() => {
              try {
                closeDb(db);
              } catch {
                /* ignore */
              }
              res();
            });
          }),
      });
    });
  });
}

// ---- helpers ----

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const json = JSON.stringify(body);
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(json);
}

function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => {
      if (!data) return resolve({});
      try {
        resolve(JSON.parse(data) as Record<string, unknown>);
      } catch {
        resolve({}); // fail open on malformed JSON
      }
    });
    req.on("error", () => resolve({}));
  });
}

function numParam(u: URL, key: string, fallback: number): number {
  const v = u.searchParams.get(key);
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
