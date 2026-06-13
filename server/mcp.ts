// server/mcp.ts — the Datum STDIO MCP server (schema §4 "MCP server").
//
// Four in-context tools, each a thin proxy over the bus. NO sdk: a hand-rolled
// newline-delimited JSON-RPC 2.0 loop over stdin/stdout:
//   - "initialize"  -> { protocolVersion, capabilities:{tools:{}}, serverInfo }
//   - "tools/list"  -> the 4 tool schemas
//   - "tools/call"  -> dispatch to the handler, wrap the result as MCP content
//
// The 4 tool HANDLERS are also exported as plain async functions so they are
// unit-testable without the stdio loop. The server NEVER calls the model — it
// reads truth the deterministic path already produced. FAIL OPEN: a bus that is
// unreachable makes a tool return a structured { warning }, never a crash.
//
// Run directly (registered by `datum init` as `node server/mcp.ts`):
//   node server/mcp.ts

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runAsEntry } from "./entry.ts";

const PROTOCOL_VERSION = "2024-11-05";
const DEFAULT_BUS_URL = "http://127.0.0.1:4317";
// keep tool calls snappy; an unreachable bus must not hang the agent.
const BUS_TIMEOUT_MS = 2000;

// ---- local hook state (schema §8: .datum/state.json) ----

type DatumState = {
  session_id?: string;
  human?: string;
  branch?: string;
  last_synced_version?: number;
  claim_files?: string[];
  claim_symbols?: string[];
  bus_url?: string;
};

/** Read .datum/state.json from the workspace (best-effort; {} on any failure). */
export function readState(projectDir?: string): DatumState {
  const dir = projectDir || process.env.CLAUDE_PROJECT_DIR || process.cwd();
  try {
    const raw = readFileSync(join(dir, ".datum", "state.json"), "utf8");
    return JSON.parse(raw) as DatumState;
  } catch {
    return {};
  }
}

/** Bus base URL: state.bus_url ?? DATUM_BUS_URL ?? default (schema §4/§8). */
export function busUrl(state: DatumState = readState()): string {
  return state.bus_url || process.env.DATUM_BUS_URL || DEFAULT_BUS_URL;
}

// ---- fail-open fetch helpers ----

type Warned<T> = T | { warning: string };

function warn(message: string): { warning: string } {
  return { warning: message };
}

async function busGet<T>(path: string): Promise<Warned<T>> {
  const url = `${busUrl()}${path}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), BUS_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) return warn(`datum bus ${path} returned ${res.status}`);
    return (await res.json()) as T;
  } catch (err) {
    return warn(`datum bus unreachable at ${url}: ${errMsg(err)}`);
  } finally {
    clearTimeout(timer);
  }
}

async function busPost<T>(path: string, body: unknown): Promise<Warned<T>> {
  const url = `${busUrl()}${path}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), BUS_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    if (!res.ok) return warn(`datum bus ${path} returned ${res.status}`);
    return (await res.json()) as T;
  } catch (err) {
    return warn(`datum bus unreachable at ${url}: ${errMsg(err)}`);
  } finally {
    clearTimeout(timer);
  }
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

// ---- the four tool handlers (plain async, unit-testable) ----

type RegistrySnapshot = { registry_version: number; contracts: unknown[] };
type DeltasResult = { deltas: unknown[] };
type DecideResult = { ledger_id: number; registry_version: number };
type AdvisoriesResult = { advisories: unknown[] };

/** datum_registry_snapshot() -> GET {bus}/registry. */
export async function datum_registry_snapshot(): Promise<Warned<RegistrySnapshot>> {
  return busGet<RegistrySnapshot>("/registry");
}

/** datum_deltas_since(version) -> GET {bus}/deltas?since=version. */
export async function datum_deltas_since(version: number): Promise<Warned<DeltasResult>> {
  const since = Number.isFinite(Number(version)) ? Number(version) : 0;
  return busGet<DeltasResult>(`/deltas?since=${encodeURIComponent(String(since))}`);
}

/**
 * datum_decide(description, contract?) -> POST {bus}/decide.
 * author resolved from .datum/state.json (§8); epoch-NEUTRAL (§4) — returns the
 * CURRENT registry_version unchanged.
 */
export async function datum_decide(
  description: string,
  contract?: string,
): Promise<Warned<DecideResult>> {
  const state = readState();
  const author = state.human || "";
  const body: { author: string; description: string; contract?: string } = {
    author,
    description: String(description ?? ""),
  };
  if (contract != null) body.contract = String(contract);
  return busPost<DecideResult>("/decide", body);
}

/** datum_my_advisories() -> GET {bus}/sessions/:id/advisories (id from §8). */
export async function datum_my_advisories(): Promise<Warned<AdvisoriesResult>> {
  const state = readState();
  const sid = state.session_id || "";
  if (!sid) return warn("no session_id in .datum/state.json; run datum init first");
  return busGet<AdvisoriesResult>(`/sessions/${encodeURIComponent(sid)}/advisories`);
}

// ---- MCP tool schemas (tools/list) ----

export const TOOLS = [
  {
    name: "datum_registry_snapshot",
    description:
      "Current registry snapshot: { registry_version, contracts }. The workspace's current truth version and every contract at its current_version.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: "datum_deltas_since",
    description:
      "Contract-surface deltas with epoch greater than `version` — what changed since you last synced.",
    inputSchema: {
      type: "object",
      properties: {
        version: {
          type: "number",
          description: "The last registry_version you have seen (deltas with epoch > version are returned).",
        },
      },
      required: ["version"],
      additionalProperties: false,
    },
  },
  {
    name: "datum_decide",
    description:
      "Record a free-form decision in the ledger (epoch-neutral). Author is read from the local session state.",
    inputSchema: {
      type: "object",
      properties: {
        description: { type: "string", description: "The decision text, e.g. 'rename users.email, phone signups landing'." },
        contract: { type: "string", description: "Optional contract id this decision concerns, e.g. 'db.users'." },
      },
      required: ["description"],
      additionalProperties: false,
    },
  },
  {
    name: "datum_my_advisories",
    description:
      "Advisories addressed to the calling session — tailored guidance from the arbiter about deltas that touch your work.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },
] as const;

// ---- tools/call dispatch ----

/** Run a tool by name; returns the raw handler result (Warned<...>). */
export async function callTool(name: string, args: Record<string, unknown> = {}): Promise<unknown> {
  switch (name) {
    case "datum_registry_snapshot":
      return datum_registry_snapshot();
    case "datum_deltas_since":
      return datum_deltas_since(Number(args.version));
    case "datum_decide":
      return datum_decide(
        String(args.description ?? ""),
        args.contract != null ? String(args.contract) : undefined,
      );
    case "datum_my_advisories":
      return datum_my_advisories();
    default:
      return warn(`unknown tool: ${name}`);
  }
}

/** Wrap a handler result as an MCP tools/call result (text content + isError on warning). */
function toCallResult(result: unknown): { content: Array<{ type: "text"; text: string }>; isError?: boolean } {
  const isError =
    typeof result === "object" && result !== null && "warning" in (result as Record<string, unknown>);
  return {
    content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    ...(isError ? { isError: true } : {}),
  };
}

// ---- JSON-RPC 2.0 dispatch (hand-rolled, no sdk) ----

type JsonRpcRequest = {
  jsonrpc?: string;
  id?: number | string | null;
  method?: string;
  params?: Record<string, unknown>;
};

type JsonRpcResponse = {
  jsonrpc: "2.0";
  id: number | string | null;
  result?: unknown;
  error?: { code: number; message: string };
};

/**
 * Handle a single JSON-RPC request. Returns a response, or null for a
 * notification (no id) we don't answer.
 */
export async function handleRpc(req: JsonRpcRequest): Promise<JsonRpcResponse | null> {
  const id = req.id ?? null;
  const method = req.method ?? "";

  if (method === "initialize") {
    return {
      jsonrpc: "2.0",
      id,
      result: {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: { name: "datum", version: "0.1.0" },
      },
    };
  }

  if (method === "tools/list") {
    return { jsonrpc: "2.0", id, result: { tools: TOOLS } };
  }

  if (method === "tools/call") {
    const params = req.params ?? {};
    const name = String(params.name ?? "");
    const args = (params.arguments as Record<string, unknown>) ?? {};
    const result = await callTool(name, args);
    return { jsonrpc: "2.0", id, result: toCallResult(result) };
  }

  // notifications (e.g. notifications/initialized) carry no id -> no reply.
  if (req.id == null) return null;

  return {
    jsonrpc: "2.0",
    id,
    error: { code: -32601, message: `method not found: ${method}` },
  };
}

// ---- stdio loop (newline-delimited JSON-RPC) ----

function startStdioLoop(): void {
  let buf = "";
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (chunk: string) => {
    buf += chunk;
    let idx: number;
    while ((idx = buf.indexOf("\n")) !== -1) {
      const line = buf.slice(0, idx).trim();
      buf = buf.slice(idx + 1);
      if (!line) continue;
      let req: JsonRpcRequest;
      try {
        req = JSON.parse(line) as JsonRpcRequest;
      } catch {
        // malformed line -> ignore (fail open; never crash).
        continue;
      }
      handleRpc(req)
        .then((resp) => {
          if (resp) process.stdout.write(JSON.stringify(resp) + "\n");
        })
        .catch((err) => {
          // never crash the loop; emit a JSON-RPC error if the request had an id.
          if (req.id != null) {
            const resp: JsonRpcResponse = {
              jsonrpc: "2.0",
              id: req.id,
              error: { code: -32603, message: `internal error: ${errMsg(err)}` },
            };
            process.stdout.write(JSON.stringify(resp) + "\n");
          }
        });
    }
  });
  process.stdin.on("end", () => process.exit(0));
}

// Run directly: `node server/mcp.ts` (dev) or `node dist/mcp.js` (dist).
const isMain = runAsEntry(import.meta.url, "mcp");

if (isMain) {
  startStdioLoop();
}
