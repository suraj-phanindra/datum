// server/bus.ts — the node:http bus + registry server. Exposes every schema §4
// endpoint, appends every posted event to the events table (source of truth),
// and broadcasts events to SSE subscribers. JSON in/out. Fail open.
//
// No model touches this path.

import { createServer, type IncomingMessage, type ServerResponse, type Server } from "node:http";
import { URL } from "node:url";
import { openDb, close as closeDb, type Database } from "./db.ts";
import { Store, type Event } from "./store.ts";
import { Reconciler } from "./reconcile.ts";
import { routeBus, type BusBroadcast } from "./router.ts";

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

  function broadcast(ev: Event | BusBroadcast): void {
    // The SSE `data` is the full event object (watchers de-dupe by `id`); the
    // router carries id + ts through on every broadcast so the frame is
    // byte-identical to the inline bus.
    const frame = `id: ${(ev as Event).id}\nevent: ${ev.type}\ndata: ${JSON.stringify(ev)}\n\n`;
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

    // ==== STREAMING + transport-specific routes (stay in the bus) ====
    // These hold the connection (long-poll / SSE) and own the version-waiter +
    // SSE-client plumbing; they cannot be expressed as a plain BusResult.

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

    // ==== NON-STREAMING routes: delegate to the transport-agnostic router ====
    // routeBus runs the exact same Store / registry / reconcile calls and
    // returns status + JSON body, the events to broadcast, and whether the
    // registry version bumped. The bus then writes the response and performs
    // the transport side effects (SSE fan-out, version-waiter wakeups).
    const body = method === "POST" || method === "PATCH" ? await readJson(req) : undefined;
    const result = routeBus(store, reconciler, {
      method,
      path,
      query: u.searchParams,
      body,
    });

    // transport side effects: fan out the returned events over SSE, then wake
    // /version/wait long-pollers (and, where wired, the async arbiter) on a bump.
    for (const ev of result.broadcast ?? []) broadcast(ev);
    if (result.versionBumped) wakeVersionWaiters();

    return sendJson(res, result.status, result.body);
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
