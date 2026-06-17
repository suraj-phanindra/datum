// cloud/src/workspace-bus.ts — the per-workspace coordination object on Cloudflare.
//
// One core, two transports (ws2a-cloud-backend.md). This Durable Object is the
// HOSTED bus. It holds NONE of the coordination logic: it runs the SAME shared
// core the OSS node:http bus runs — a Store over a SqlBackend, plus the
// Reconciler — and delegates every non-streaming route to routeBus(). The only
// things that live here are the Cloudflare-specific transport seams:
//   - the DO-SQLite backend (ctx.storage.sql) under the Store,
//   - the hibernatable WebSocket fan-out (replacing OSS GET /stream SSE),
//   - the /version/wait long-poll (replacing OSS holding the http request),
//   - producing onto the arbiter Queue when POST /events bumps the version.
//
// Addressed per workspace via env.WORKSPACE_BUS.getByName(workspace_id), so each
// workspace gets an isolated SQLite registry by construction (§ the DO adopts
// the first workspace_id it sees, the existing single-registry-per-team rule).
//
// THIN by design: all real logic stays in server/* (the shared OSS core). If a
// behavior is not transport-specific, it must not appear in this file.

import { DurableObject } from "cloudflare:workers";
import type { Env } from "./env.ts";
import { DoSqliteBackend } from "./do-sqlite-backend.ts";
import { Store } from "../../server/store.ts";
import { Reconciler } from "../../server/reconcile.ts";
import { routeBus, type BusRequest } from "../../server/router.ts";
// SCHEMA_SQL is a plain template string with ZERO node imports (it lives in
// server/schema.ts, a node-free leaf, precisely so it is safe to bootstrap the
// DO's SQLite from it without pulling node:sqlite into the Worker bundle).
import { SCHEMA_SQL } from "../../server/schema.ts";

export class WorkspaceBus extends DurableObject<Env> {
  private store: Store;
  private reconciler: Reconciler;
  // In-memory long-poll waiters for /version/wait, woken on any version bump.
  // Lost on hibernation/eviction, which is fine: the client long-poll re-issues
  // with ?since=<lastVersion> and the immediate-return check covers any bump it
  // missed while the DO slept (fail-open, never a stale deny).
  private versionWaiters = new Set<() => void>();

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    const backend = new DoSqliteBackend(ctx.storage.sql);
    this.store = new Store(backend);
    this.reconciler = new Reconciler(this.store);
    // Bootstrap the schema exactly once, before any request is served. SCHEMA_SQL
    // is all CREATE TABLE IF NOT EXISTS, so this is idempotent across restarts.
    ctx.blockConcurrencyWhile(async () => {
      backend.exec(SCHEMA_SQL);
    });
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    // ---- GET /stream -> hibernatable WebSocket fan-out (OSS SSE equivalent) ----
    // Auth and CSWSH Origin validation are enforced in the Worker router
    // (worker.ts) before the upgrade reaches the DO; the DO is reachable only via
    // the WORKSPACE_BUS binding, never publicly, so the upgrade here is pre-vetted.
    if (path === "/stream" && request.headers.get("Upgrade") === "websocket") {
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      // Hibernatable accept: the DO can sleep while the socket stays open; the
      // runtime redelivers messages to webSocketMessage/Close on wake.
      this.ctx.acceptWebSocket(server);
      return new Response(null, { status: 101, webSocket: client });
    }

    // ---- GET /version/wait?since=N&timeout=ms -> long-poll ----
    // Same client contract as the OSS bus: return immediately if already bumped
    // past `since`, otherwise hold until a bump wakes us or `timeout` elapses,
    // then return { registry_version, changed }.
    if (path === "/version/wait") {
      const since = numParam(url, "since", this.store.getVersion());
      const timeout = numParam(url, "timeout", 25000);
      const current = this.store.getVersion();
      if (current > since) {
        return json(200, { registry_version: current, changed: true });
      }
      await this.waitForBump(timeout);
      const after = this.store.getVersion();
      return json(200, { registry_version: after, changed: after > since });
    }

    // ==== NON-STREAMING routes: delegate to the shared transport-agnostic router.
    // routeBus runs the identical Store/registry/reconcile calls as the OSS bus
    // and returns { status, body, broadcast?, versionBumped? }. We write the JSON
    // response, fan the broadcast events out to every connected WebSocket, and —
    // on a version bump — produce onto the arbiter Queue with the detected delta.
    let body: unknown;
    if (request.method === "POST" || request.method === "PATCH") {
      body = await readJson(request);
    }
    const req: BusRequest = {
      method: request.method,
      path,
      query: url.searchParams,
      body,
    };
    const result = routeBus(this.store, this.reconciler, req);

    // Fan out to all live WebSocket watchers (de-duped client-side by event id).
    if (result.broadcast && result.broadcast.length > 0) {
      const sockets = this.ctx.getWebSockets();
      if (sockets.length > 0) {
        for (const ev of result.broadcast) {
          const frame = JSON.stringify(ev);
          for (const ws of sockets) {
            try {
              ws.send(frame);
            } catch {
              /* a dead socket; the close handler cleans it up */
            }
          }
        }
      }
    }

    // A version bump means a contract-relevant delta landed. Wake long-pollers,
    // then enqueue the arbiter OFF the critical path. routeBus surfaces the
    // detected delta on the POST /events response body as `delta`.
    if (result.versionBumped) {
      this.wakeVersionWaiters();
      const delta = (result.body as { delta?: unknown } | null | undefined)?.delta;
      // workspace_id is the adopted workspace this bus serves (first join wins).
      // The arbiter consumer derives owner/repo from it, so skip enqueuing if no
      // workspace has been adopted yet (nothing to address the PR against).
      const workspaceId = this.store.getWorkspace();
      if (delta !== undefined && workspaceId) {
        await this.env.ARBITER_QUEUE.send({
          workspace_id: workspaceId,
          delta,
        });
      }
    }

    return json(result.status, result.body);
  }

  // ---- hibernatable WebSocket handlers ----
  // Watchers are read-only fan-out targets; inbound frames are ignored (a no-op
  // keeps the hibernation contract simple). The arbiter consumer appends
  // advisory.delivered etc. via the normal POST /events route (routeBus already
  // appends arbitrary event types), so NO bespoke RPC/message protocol is needed
  // here: a watcher never writes through its socket.
  async webSocketMessage(_ws: WebSocket, _message: string | ArrayBuffer): Promise<void> {
    // intentionally a no-op: /stream is observe-only.
  }

  async webSocketClose(ws: WebSocket, code: number, _reason: string, _wasClean: boolean): Promise<void> {
    try {
      ws.close(code, "closing");
    } catch {
      /* already closed */
    }
  }

  // ---- /version/wait long-poll plumbing ----

  private waitForBump(timeoutMs: number): Promise<void> {
    return new Promise<void>((resolve) => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        this.versionWaiters.delete(waiter);
        clearTimeout(timer);
        resolve();
      };
      const waiter = () => finish();
      const timer = setTimeout(finish, Math.max(0, timeoutMs));
      this.versionWaiters.add(waiter);
    });
  }

  private wakeVersionWaiters(): void {
    for (const w of this.versionWaiters) w();
    this.versionWaiters.clear();
  }
}

// ---- transport helpers (Cloudflare-specific; no coordination logic) ----

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function readJson(request: Request): Promise<Record<string, unknown>> {
  try {
    const data = await request.text();
    if (!data) return {};
    const parsed = JSON.parse(data);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return {};
  } catch {
    return {}; // fail open on malformed JSON, mirroring the OSS bus
  }
}

function numParam(url: URL, key: string, fallback: number): number {
  const v = url.searchParams.get(key);
  if (v == null) return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}
