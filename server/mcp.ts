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

async function busPatch<T>(path: string, body: unknown): Promise<Warned<T>> {
  const url = `${busUrl()}${path}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), BUS_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "PATCH",
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
type VersionResult = { registry_version: number };
type SessionsResult = { sessions: unknown[] };
type PatchSessionResult = { ok: boolean; registry_version: number };
type ClaimResult = { claim_files: string[]; claim_symbols: string[] };
type SyncResult = { registry_version: number; advisories: unknown[]; deltas: unknown[] };

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

/**
 * datum_claim(files, symbols?, add?) -> PATCH {bus}/sessions/:id with the resolved
 * { claim_files, claim_symbols }. When add is true the new files/symbols are merged
 * (deduped) with this session's current claim from .datum/state.json (§8); otherwise
 * they replace it. Returns the resolved claim.
 */
export async function datum_claim(
  files: string[],
  symbols?: string[],
  add?: boolean,
): Promise<Warned<ClaimResult>> {
  const state = readState();
  const sid = state.session_id || "";
  if (!sid) return warn("no session_id in .datum/state.json; run datum init first");

  const nextFiles = Array.isArray(files) ? files.map(String) : [];
  const nextSymbols = Array.isArray(symbols) ? symbols.map(String) : [];

  let claim_files: string[];
  let claim_symbols: string[];
  if (add) {
    claim_files = dedupe([...(state.claim_files ?? []), ...nextFiles]);
    claim_symbols = dedupe([...(state.claim_symbols ?? []), ...nextSymbols]);
  } else {
    claim_files = dedupe(nextFiles);
    claim_symbols = dedupe(nextSymbols);
  }

  const patched = await busPatch<PatchSessionResult>(
    `/sessions/${encodeURIComponent(sid)}`,
    { claim_files, claim_symbols },
  );
  if (typeof patched === "object" && patched !== null && "warning" in patched) {
    return patched as { warning: string };
  }
  return { claim_files, claim_symbols };
}

/**
 * datum_sync() -> the calling session's current truth: GET {bus}/version, that
 * session's advisories, and the deltas since its last synced version (§8). Returns
 * { registry_version, advisories, deltas }; any single bus failure yields a warning.
 */
export async function datum_sync(): Promise<Warned<SyncResult>> {
  const state = readState();
  const sid = state.session_id || "";
  if (!sid) return warn("no session_id in .datum/state.json; run datum init first");
  const since = Number.isFinite(Number(state.last_synced_version))
    ? Number(state.last_synced_version)
    : 0;

  const version = await busGet<VersionResult>("/version");
  if (isWarn(version)) return version;
  const advisories = await busGet<AdvisoriesResult>(
    `/sessions/${encodeURIComponent(sid)}/advisories`,
  );
  if (isWarn(advisories)) return advisories;
  const deltas = await busGet<DeltasResult>(
    `/deltas?since=${encodeURIComponent(String(since))}`,
  );
  if (isWarn(deltas)) return deltas;

  return {
    registry_version: version.registry_version,
    advisories: advisories.advisories,
    deltas: deltas.deltas,
  };
}

/** datum_sessions() -> GET {bus}/sessions (the live roster). */
export async function datum_sessions(): Promise<Warned<SessionsResult>> {
  return busGet<SessionsResult>("/sessions");
}

function dedupe(items: string[]): string[] {
  return [...new Set(items)];
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String) : [];
}

function isWarn<T>(value: Warned<T>): value is { warning: string } {
  return typeof value === "object" && value !== null && "warning" in value;
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
  {
    name: "datum_claim",
    description:
      "Publish this session's intent manifest: the files and symbols you are about to work on, so the arbiter can scope drift to you. Set add to merge with your current claim; otherwise it replaces it.",
    inputSchema: {
      type: "object",
      properties: {
        files: {
          type: "array",
          items: { type: "string" },
          description: "Paths you are claiming, e.g. ['routes/users.ts'].",
        },
        symbols: {
          type: "array",
          items: { type: "string" },
          description: "Optional symbols you are claiming, e.g. ['UserDTO.email'].",
        },
        add: {
          type: "boolean",
          description: "Merge with the current claim instead of replacing it.",
        },
      },
      required: ["files"],
      additionalProperties: false,
    },
  },
  {
    name: "datum_sync",
    description:
      "Sync this session to current truth before editing a shared contract surface: the registry version, your advisories, and the deltas since you last synced. Run this so the fence never has to fire.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: "datum_sessions",
    description:
      "The live roster of sessions on this workspace (human, branch, claim, status) — who else is active and what they are working on.",
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
    case "datum_claim":
      return datum_claim(
        asStringArray(args.files),
        args.symbols != null ? asStringArray(args.symbols) : undefined,
        args.add === true,
      );
    case "datum_sync":
      return datum_sync();
    case "datum_sessions":
      return datum_sessions();
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
