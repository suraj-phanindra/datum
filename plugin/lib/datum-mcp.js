// server/mcp.ts
import { readFileSync } from "node:fs";
import { join } from "node:path";

// server/entry.ts
import { resolve } from "node:path";
function runAsEntry(moduleUrl, id) {
  try {
    if ("mcp") {
      return "mcp" === id;
    }
  } catch {
  }
  try {
    return moduleUrl === `file://${resolve(process.argv[1] ?? "")}`;
  } catch {
    return false;
  }
}

// server/mcp.ts
var PROTOCOL_VERSION = "2024-11-05";
var DEFAULT_BUS_URL = "http://127.0.0.1:4317";
var BUS_TIMEOUT_MS = 2e3;
function readState(projectDir) {
  const dir = projectDir || process.env.CLAUDE_PROJECT_DIR || process.cwd();
  try {
    const raw = readFileSync(join(dir, ".datum", "state.json"), "utf8");
    return JSON.parse(raw);
  } catch {
    return {};
  }
}
function busUrl(state = readState()) {
  return state.bus_url || process.env.DATUM_BUS_URL || DEFAULT_BUS_URL;
}
function warn(message) {
  return { warning: message };
}
async function busGet(path) {
  const url = `${busUrl()}${path}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), BUS_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) return warn(`datum bus ${path} returned ${res.status}`);
    return await res.json();
  } catch (err) {
    return warn(`datum bus unreachable at ${url}: ${errMsg(err)}`);
  } finally {
    clearTimeout(timer);
  }
}
async function busPost(path, body) {
  const url = `${busUrl()}${path}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), BUS_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: ctrl.signal
    });
    if (!res.ok) return warn(`datum bus ${path} returned ${res.status}`);
    return await res.json();
  } catch (err) {
    return warn(`datum bus unreachable at ${url}: ${errMsg(err)}`);
  } finally {
    clearTimeout(timer);
  }
}
async function busPatch(path, body) {
  const url = `${busUrl()}${path}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), BUS_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: ctrl.signal
    });
    if (!res.ok) return warn(`datum bus ${path} returned ${res.status}`);
    return await res.json();
  } catch (err) {
    return warn(`datum bus unreachable at ${url}: ${errMsg(err)}`);
  } finally {
    clearTimeout(timer);
  }
}
function errMsg(err) {
  return err instanceof Error ? err.message : String(err);
}
async function datum_registry_snapshot() {
  return busGet("/registry");
}
async function datum_deltas_since(version) {
  const since = Number.isFinite(Number(version)) ? Number(version) : 0;
  return busGet(`/deltas?since=${encodeURIComponent(String(since))}`);
}
async function datum_decide(description, contract) {
  const state = readState();
  const author = state.human || "";
  const body = {
    author,
    description: String(description ?? "")
  };
  if (contract != null) body.contract = String(contract);
  return busPost("/decide", body);
}
async function datum_my_advisories() {
  const state = readState();
  const sid = state.session_id || "";
  if (!sid) return warn("no session_id in .datum/state.json; run datum init first");
  return busGet(`/sessions/${encodeURIComponent(sid)}/advisories`);
}
async function datum_claim(files, symbols, add) {
  const state = readState();
  const sid = state.session_id || "";
  if (!sid) return warn("no session_id in .datum/state.json; run datum init first");
  const nextFiles = Array.isArray(files) ? files.map(String) : [];
  const nextSymbols = Array.isArray(symbols) ? symbols.map(String) : [];
  let claim_files;
  let claim_symbols;
  if (add) {
    claim_files = dedupe([...state.claim_files ?? [], ...nextFiles]);
    claim_symbols = dedupe([...state.claim_symbols ?? [], ...nextSymbols]);
  } else {
    claim_files = dedupe(nextFiles);
    claim_symbols = dedupe(nextSymbols);
  }
  const patched = await busPatch(
    `/sessions/${encodeURIComponent(sid)}`,
    { claim_files, claim_symbols }
  );
  if (typeof patched === "object" && patched !== null && "warning" in patched) {
    return patched;
  }
  return { claim_files, claim_symbols };
}
async function datum_sync() {
  const state = readState();
  const sid = state.session_id || "";
  if (!sid) return warn("no session_id in .datum/state.json; run datum init first");
  const since = Number.isFinite(Number(state.last_synced_version)) ? Number(state.last_synced_version) : 0;
  const version = await busGet("/version");
  if (isWarn(version)) return version;
  const advisories = await busGet(
    `/sessions/${encodeURIComponent(sid)}/advisories`
  );
  if (isWarn(advisories)) return advisories;
  const deltas = await busGet(
    `/deltas?since=${encodeURIComponent(String(since))}`
  );
  if (isWarn(deltas)) return deltas;
  return {
    registry_version: version.registry_version,
    advisories: advisories.advisories,
    deltas: deltas.deltas
  };
}
async function datum_sessions() {
  return busGet("/sessions");
}
function dedupe(items) {
  return [...new Set(items)];
}
function asStringArray(value) {
  return Array.isArray(value) ? value.map(String) : [];
}
function isWarn(value) {
  return typeof value === "object" && value !== null && "warning" in value;
}
var TOOLS = [
  {
    name: "datum_registry_snapshot",
    description: "Current registry snapshot: { registry_version, contracts }. The workspace's current truth version and every contract at its current_version.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false
    }
  },
  {
    name: "datum_deltas_since",
    description: "Contract-surface deltas with epoch greater than `version` \u2014 what changed since you last synced.",
    inputSchema: {
      type: "object",
      properties: {
        version: {
          type: "number",
          description: "The last registry_version you have seen (deltas with epoch > version are returned)."
        }
      },
      required: ["version"],
      additionalProperties: false
    }
  },
  {
    name: "datum_decide",
    description: "Record a free-form decision in the ledger (epoch-neutral). Author is read from the local session state.",
    inputSchema: {
      type: "object",
      properties: {
        description: { type: "string", description: "The decision text, e.g. 'rename users.email, phone signups landing'." },
        contract: { type: "string", description: "Optional contract id this decision concerns, e.g. 'db.users'." }
      },
      required: ["description"],
      additionalProperties: false
    }
  },
  {
    name: "datum_my_advisories",
    description: "Advisories addressed to the calling session \u2014 tailored guidance from the arbiter about deltas that touch your work.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false
    }
  },
  {
    name: "datum_claim",
    description: "Publish this session's intent manifest: the files and symbols you are about to work on, so the arbiter can scope drift to you. Set add to merge with your current claim; otherwise it replaces it.",
    inputSchema: {
      type: "object",
      properties: {
        files: {
          type: "array",
          items: { type: "string" },
          description: "Paths you are claiming, e.g. ['routes/users.ts']."
        },
        symbols: {
          type: "array",
          items: { type: "string" },
          description: "Optional symbols you are claiming, e.g. ['UserDTO.email']."
        },
        add: {
          type: "boolean",
          description: "Merge with the current claim instead of replacing it."
        }
      },
      required: ["files"],
      additionalProperties: false
    }
  },
  {
    name: "datum_sync",
    description: "Sync this session to current truth before editing a shared contract surface: the registry version, your advisories, and the deltas since you last synced. Run this so the fence never has to fire.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false
    }
  },
  {
    name: "datum_sessions",
    description: "The live roster of sessions on this workspace (human, branch, claim, status) \u2014 who else is active and what they are working on.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false
    }
  }
];
async function callTool(name, args = {}) {
  switch (name) {
    case "datum_registry_snapshot":
      return datum_registry_snapshot();
    case "datum_deltas_since":
      return datum_deltas_since(Number(args.version));
    case "datum_decide":
      return datum_decide(
        String(args.description ?? ""),
        args.contract != null ? String(args.contract) : void 0
      );
    case "datum_my_advisories":
      return datum_my_advisories();
    case "datum_claim":
      return datum_claim(
        asStringArray(args.files),
        args.symbols != null ? asStringArray(args.symbols) : void 0,
        args.add === true
      );
    case "datum_sync":
      return datum_sync();
    case "datum_sessions":
      return datum_sessions();
    default:
      return warn(`unknown tool: ${name}`);
  }
}
function toCallResult(result) {
  const isError = typeof result === "object" && result !== null && "warning" in result;
  return {
    content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    ...isError ? { isError: true } : {}
  };
}
async function handleRpc(req) {
  const id = req.id ?? null;
  const method = req.method ?? "";
  if (method === "initialize") {
    return {
      jsonrpc: "2.0",
      id,
      result: {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: { name: "datum", version: "0.1.0" }
      }
    };
  }
  if (method === "tools/list") {
    return { jsonrpc: "2.0", id, result: { tools: TOOLS } };
  }
  if (method === "tools/call") {
    const params = req.params ?? {};
    const name = String(params.name ?? "");
    const args = params.arguments ?? {};
    const result = await callTool(name, args);
    return { jsonrpc: "2.0", id, result: toCallResult(result) };
  }
  if (req.id == null) return null;
  return {
    jsonrpc: "2.0",
    id,
    error: { code: -32601, message: `method not found: ${method}` }
  };
}
function startStdioLoop() {
  let buf = "";
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (chunk) => {
    buf += chunk;
    let idx;
    while ((idx = buf.indexOf("\n")) !== -1) {
      const line = buf.slice(0, idx).trim();
      buf = buf.slice(idx + 1);
      if (!line) continue;
      let req;
      try {
        req = JSON.parse(line);
      } catch {
        continue;
      }
      handleRpc(req).then((resp) => {
        if (resp) process.stdout.write(JSON.stringify(resp) + "\n");
      }).catch((err) => {
        if (req.id != null) {
          const resp = {
            jsonrpc: "2.0",
            id: req.id,
            error: { code: -32603, message: `internal error: ${errMsg(err)}` }
          };
          process.stdout.write(JSON.stringify(resp) + "\n");
        }
      });
    }
  });
  process.stdin.on("end", () => process.exit(0));
}
var isMain = runAsEntry(import.meta.url, "mcp");
if (isMain) {
  startStdioLoop();
}
export {
  TOOLS,
  busUrl,
  callTool,
  datum_claim,
  datum_decide,
  datum_deltas_since,
  datum_my_advisories,
  datum_registry_snapshot,
  datum_sessions,
  datum_sync,
  handleRpc,
  readState
};
