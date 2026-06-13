// web/serve.ts — the tower's node:http server (read-only).
//
// SOLE OWNER of this file (RECONCILIATION ownership matrix). It is a pure
// CONSUMER of the bus: on GET / it fetches the current snapshot from the bus
// (GET {busUrl}/registry + /deltas?since=0 [+ ledger best-effort]) and
// SERVER-SIDE EMBEDS it into the HTML as
//   window.__DATUM__ = { registry_version, contracts, deltas, ledger? }
// so the page shows the truth WITHOUT JS (and so deploy can bake a static
// snapshot later, behind a scoped flag, without forking this render path).
//
// It serves index.html, tower.js, tokens-shim.css, and a bundled /tokens.css
// (the shipped design-system tokens). It PROXIES /stream (SSE), /registry, and
// /deltas to the bus so the page can also live-update.
//
// READ-ONLY: this server NEVER POSTs to the bus. No model touches this path.

import { createServer, type IncomingMessage, type ServerResponse, type Server } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..");
const DS_TOKENS = join(REPO_ROOT, "datum Design System", "tokens");

export type StartTowerOptions = {
  port?: number;
  busUrl?: string;
};

export type TowerHandle = {
  url: string;
  port: number;
  server: Server;
  close: () => Promise<void>;
};

type Snapshot = {
  registry_version: number;
  contracts: unknown[];
  deltas: unknown[];
  ledger?: unknown[];
};

/**
 * Start the tower web server. Returns a handle with the resolved url + close().
 * `busUrl` defaults to DATUM_BUS_URL or http://127.0.0.1:4317.
 */
export async function startTower(opts: StartTowerOptions = {}): Promise<TowerHandle> {
  const busUrl = (opts.busUrl ?? process.env.DATUM_BUS_URL ?? "http://127.0.0.1:4317").replace(/\/$/, "");

  // Static assets are read once at start (they don't change at runtime).
  const [indexHtml, towerJs, tokensShim, tokensBundle] = await Promise.all([
    readFile(join(__dirname, "index.html"), "utf8"),
    readFile(join(__dirname, "tower.js"), "utf8"),
    readFile(join(__dirname, "tokens-shim.css"), "utf8"),
    bundleTokens(),
  ]);

  const server = createServer((req, res) => {
    handle(req, res).catch((err) => {
      sendText(res, 500, "text/plain", "tower error: " + String(err && (err as Error).message));
    });
  });

  async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const method = req.method ?? "GET";
    const path = (req.url ?? "/").split("?")[0];

    // ---- live proxies to the bus (so the page can live-update) ----
    if (method === "GET" && path === "/stream") return proxyStream(req, res, busUrl);
    if (method === "GET" && (path === "/registry" || path === "/deltas")) {
      return proxyJson(req, res, busUrl);
    }
    if (method === "GET" && path === "/healthz") {
      return sendJson(res, 200, { ok: true });
    }

    // ---- static assets ----
    if (method === "GET" && path === "/tower.js") {
      return sendText(res, 200, "text/javascript; charset=utf-8", towerJs);
    }
    if (method === "GET" && path === "/tokens-shim.css") {
      return sendText(res, 200, "text/css; charset=utf-8", tokensShim);
    }
    if (method === "GET" && path === "/tokens.css") {
      return sendText(res, 200, "text/css; charset=utf-8", tokensBundle);
    }

    // ---- GET / : fetch the snapshot, embed it, serve the hydrated page ----
    if (method === "GET" && (path === "/" || path === "/index.html")) {
      const snapshot = await fetchSnapshot(busUrl);
      const html = embedSnapshot(indexHtml, snapshot);
      return sendText(res, 200, "text/html; charset=utf-8", html);
    }

    return sendText(res, 404, "text/plain", "not found");
  }

  return new Promise<TowerHandle>((resolve) => {
    const port = opts.port ?? defaultPort();
    server.listen(port, "127.0.0.1", () => {
      const addr = server.address();
      const resolvedPort = typeof addr === "object" && addr ? addr.port : Number(port);
      const url = `http://127.0.0.1:${resolvedPort}`;
      resolve({
        url,
        port: resolvedPort,
        server,
        close: () =>
          new Promise<void>((done) => {
            server.close(() => done());
          }),
      });
    });
  });
}

// ---------------------------------------------------------------------------
// snapshot — read-only GETs against the bus. Fail OPEN: if the bus is
// unreachable, serve the page with an empty snapshot rather than 500'ing (the
// static markup still renders the seeded end-state; deploy bakes a real one).
// ---------------------------------------------------------------------------
async function fetchSnapshot(busUrl: string): Promise<Snapshot> {
  const empty: Snapshot = { registry_version: 0, contracts: [], deltas: [], ledger: [] };
  try {
    const [regRes, deltaRes] = await Promise.all([
      fetch(`${busUrl}/registry`),
      fetch(`${busUrl}/deltas?since=0`),
    ]);
    const reg = (await regRes.json()) as { registry_version?: number; contracts?: unknown[] };
    const deltas = (await deltaRes.json()) as { deltas?: unknown[] };
    return {
      registry_version: typeof reg.registry_version === "number" ? reg.registry_version : 0,
      contracts: Array.isArray(reg.contracts) ? reg.contracts : [],
      deltas: Array.isArray(deltas.deltas) ? deltas.deltas : [],
      // ledger is not a dedicated bus GET; the static markup carries it and the
      // SSE router refreshes it live. Left empty here on purpose.
      ledger: [],
    };
  } catch {
    return empty;
  }
}

/**
 * Server-side embed: inject `window.__DATUM__ = {...}` right before tower.js
 * loads so the page shows the truth even with JS disabled (the JSON is present
 * in the served HTML), and so tower.js hydrates from it. JSON is escaped so a
 * "</script>" in any string can never break out of the inline script.
 */
function embedSnapshot(html: string, snapshot: Snapshot): string {
  const json = JSON.stringify(snapshot).replace(/</g, "\\u003c");
  const tag = `<script>window.__DATUM__ = ${json};</script>`;
  const marker = '<script src="/tower.js"></script>';
  if (html.includes(marker)) {
    return html.replace(marker, tag + "\n  " + marker);
  }
  // fallback: inject before </body>.
  return html.replace("</body>", tag + "\n</body>");
}

// ---------------------------------------------------------------------------
// design-system token bundle — concatenate the shipped token files (colors,
// typography, spacing, base) into one /tokens.css response. @import is avoided
// because the source files live outside web/ (and have a space in the path).
// ---------------------------------------------------------------------------
async function bundleTokens(): Promise<string> {
  const files = ["colors.css", "typography.css", "spacing.css", "base.css"];
  const parts: string[] = ["/* bundled from datum Design System/tokens/*.css */"];
  for (const f of files) {
    try {
      parts.push(await readFile(join(DS_TOKENS, f), "utf8"));
    } catch {
      /* a missing token file must not brick the tower */
    }
  }
  return parts.join("\n\n");
}

// ---------------------------------------------------------------------------
// proxies
// ---------------------------------------------------------------------------

/** Proxy a plain JSON GET (/registry, /deltas) straight from the bus. */
async function proxyJson(req: IncomingMessage, res: ServerResponse, busUrl: string): Promise<void> {
  try {
    const upstream = await fetch(busUrl + (req.url ?? "/"));
    const body = await upstream.text();
    res.writeHead(upstream.status, { "Content-Type": "application/json" });
    res.end(body);
  } catch (err) {
    sendJson(res, 502, { ok: false, error: "bus unreachable: " + String(err && (err as Error).message) });
  }
}

/**
 * Proxy the SSE stream from the bus to the browser. Reads the upstream body as
 * a stream and pipes each chunk through, so the tower live-updates without the
 * page talking to the bus directly.
 */
async function proxyStream(req: IncomingMessage, res: ServerResponse, busUrl: string): Promise<void> {
  let upstream: Response;
  try {
    upstream = await fetch(busUrl + "/stream");
  } catch (err) {
    sendJson(res, 502, { ok: false, error: "bus stream unreachable: " + String(err && (err as Error).message) });
    return;
  }
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  const body = upstream.body;
  if (!body) {
    res.end();
    return;
  }
  const reader = body.getReader();
  const pump = async () => {
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) res.write(Buffer.from(value));
      }
    } catch {
      /* upstream closed */
    } finally {
      try {
        res.end();
      } catch {
        /* ignore */
      }
    }
  };
  req.on("close", () => {
    try {
      void reader.cancel();
    } catch {
      /* ignore */
    }
  });
  void pump();
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function defaultPort(): number {
  const url = process.env.DATUM_TOWER_URL;
  if (url) {
    try {
      const p = new URL(url).port;
      if (p) return Number(p);
    } catch {
      /* ignore */
    }
  }
  return 4318;
}

function sendText(res: ServerResponse, status: number, contentType: string, body: string): void {
  res.writeHead(status, { "Content-Type": contentType });
  res.end(body);
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

// Run directly: `node web/serve.ts`
const isMain = (() => {
  try {
    return import.meta.url === `file://${process.argv[1]}`;
  } catch {
    return false;
  }
})();

if (isMain) {
  startTower()
    .then((tower) => {
      // eslint-disable-next-line no-console
      console.log(`datum tower listening on ${tower.url}`);
      const shutdown = () => {
        tower.close().then(() => process.exit(0));
      };
      process.on("SIGINT", shutdown);
      process.on("SIGTERM", shutdown);
    })
    .catch((err) => {
      // eslint-disable-next-line no-console
      console.error("failed to start datum tower:", err);
      process.exit(1);
    });
}
