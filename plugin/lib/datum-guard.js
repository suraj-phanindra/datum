// hooks/datum-guard.ts
import { readFileSync, appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

// server/watchlist.ts
function referencesStaleSymbol(content, mechanicalChange) {
  const stale = staleSymbolOf(mechanicalChange);
  if (!stale) return false;
  return wordBoundaryMatch(content, stale);
}
function staleSymbolOf(mc) {
  switch (mc.kind) {
    case "rename_column":
      return mc.from;
    case "drop_column":
      return mc.column;
    case "api_field_renamed":
    case "api_field_removed":
      return mc.from ?? null;
    default:
      return null;
  }
}
function wordBoundaryMatch(content, symbol) {
  const escaped = symbol.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`(?<![\\w])${escaped}(?![\\w])`);
  return re.test(content);
}

// server/fence.ts
function decideFence(input) {
  if (input.lastSyncedVersion === input.currentVersion) {
    return { decision: "allow" };
  }
  const { content, path } = input.write;
  const tool = input.write.tool_name || "Edit";
  let injectDecision = null;
  for (const delta of input.deltas) {
    const mc = delta.mechanical_change;
    if (referencesStaleSymbol(content, mc)) {
      return { decision: "deny", reason: denyReason(delta, mc, tool) };
    }
    if (injectDecision == null && writeInDeltaScope(path, delta, mc)) {
      injectDecision = {
        decision: "inject",
        additionalContext: injectContext(delta, mc)
      };
    }
  }
  if (injectDecision) return injectDecision;
  return { decision: "allow" };
}
function denyReason(delta, mc, tool) {
  const fromTo = mechanicalChangeText(mc);
  const stale = staleSymbol(mc);
  const to = renamedTo(mc);
  const migration = "migration" in mc && mc.migration ? `migration ${mc.migration}, ` : "";
  const head = `${delta.contract_id}.${fromTo} (${migration}${delta.author}).`;
  const ref = stale ? ` This ${tool} references .${stale} and will break.` : "";
  const imperative = to ? ` Re-sync to v${delta.epoch} and use ${to}.` : ` Re-sync to v${delta.epoch}.`;
  return `${head}${ref}${imperative}`;
}
function mechanicalChangeText(mc) {
  switch (mc.kind) {
    case "rename_column":
      return `${mc.from} was renamed to ${mc.to}`;
    case "drop_column":
      return `${mc.column} was removed`;
    case "api_field_renamed":
      return mc.from && mc.to ? `${mc.from} was renamed to ${mc.to}` : `field changed on ${mc.route}`;
    case "api_field_removed":
      return mc.from ? `${mc.from} was removed` : `field removed on ${mc.route}`;
    default:
      return "surface changed";
  }
}
function staleSymbol(mc) {
  switch (mc.kind) {
    case "rename_column":
      return mc.from;
    case "drop_column":
      return mc.column;
    case "api_field_renamed":
    case "api_field_removed":
      return mc.from ?? null;
    default:
      return null;
  }
}
function renamedTo(mc) {
  switch (mc.kind) {
    case "rename_column":
      return mc.to;
    case "api_field_renamed":
      return mc.to ?? null;
    default:
      return null;
  }
}
function injectContext(delta, mc) {
  const change = mechanicalChangeText(mc);
  return `Heads up: ${delta.contract_id}.${change} (epoch v${delta.epoch}, ${delta.author}). Your write touches this contract's surface. Re-sync to v${delta.epoch} before relying on the old shape.`;
}
function writeInDeltaScope(path, delta, mc) {
  if (!path) return false;
  const p = path.toLowerCase();
  if (mc.kind === "rename_column" || mc.kind === "add_column" || mc.kind === "drop_column") {
    if (/(^|\/)migrations\//.test(p)) return true;
    if (/(^|\/)schema\.sql$/.test(p)) return true;
    const table = mc.table?.toLowerCase();
    if (table && p.includes(table)) return true;
    return false;
  }
  if (mc.kind === "api_field_renamed" || mc.kind === "api_field_removed") {
    if (/(^|\/)routes\//.test(p)) return true;
    if (/\.controller\.ts$/.test(p)) return true;
    if (/(^|\/)openapi\./.test(p)) return true;
    return false;
  }
  return false;
}

// server/entry.ts
import { resolve } from "node:path";
function runAsEntry(moduleUrl, id) {
  try {
    if ("guard") {
      return "guard" === id;
    }
  } catch {
  }
  try {
    return moduleUrl === `file://${resolve(process.argv[1] ?? "")}`;
  } catch {
    return false;
  }
}

// hooks/datum-guard.ts
var BUS_BUDGET_MS = 1e3;
var EXIT_ALLOW = 0;
var EXIT_BLOCK = 2;
async function main() {
  const raw = await readStdin();
  let input = {};
  try {
    input = raw ? JSON.parse(raw) : {};
  } catch {
    return EXIT_ALLOW;
  }
  const cwd = input.cwd || process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const datumDir = join(cwd, ".datum");
  const state = readState(datumDir);
  const busUrl = state.bus_url || process.env.DATUM_BUS_URL || "http://127.0.0.1:4317";
  const lastSynced = Number(state.last_synced_version ?? 0);
  const content = (state.claim_symbols ?? []).join("\n");
  const path = (state.claim_files ?? [])[0] ?? "";
  const deadline = Date.now() + BUS_BUDGET_MS;
  let currentVersion;
  let deltas;
  try {
    const version = await getVersion(busUrl, deadline);
    if (version == null) {
      failOpen(datumDir, `bus /version unreachable at ${busUrl}`);
      return EXIT_ALLOW;
    }
    currentVersion = version;
    if (lastSynced === currentVersion) {
      return EXIT_ALLOW;
    }
    const pulled = await getDeltas(busUrl, lastSynced, deadline);
    if (pulled == null) {
      failOpen(datumDir, `bus /deltas unreachable at ${busUrl}`);
      return EXIT_ALLOW;
    }
    deltas = pulled;
  } catch (err) {
    failOpen(datumDir, `bus error: ${errMsg(err)}`);
    return EXIT_ALLOW;
  }
  const fenceInput = {
    write: { path, tool_name: "Stop", content },
    lastSyncedVersion: lastSynced,
    currentVersion,
    deltas
  };
  let decision;
  try {
    decision = decideFence(fenceInput);
  } catch (err) {
    failOpen(datumDir, `decideFence threw: ${errMsg(err)}`);
    return EXIT_ALLOW;
  }
  if (decision.decision === "deny" || decision.decision === "inject") {
    const reason = withRelativeTime(blockReason(decision), deltas);
    emit({ decision: "block", reason });
    process.stderr.write(`${reason}
`);
    return EXIT_BLOCK;
  }
  return EXIT_ALLOW;
}
function blockReason(decision) {
  if (decision.decision === "deny") return decision.reason;
  if (decision.decision === "inject") return decision.additionalContext;
  return "unacknowledged delta intersects this session";
}
function failOpen(datumDir, message) {
  try {
    mkdirSync(datumDir, { recursive: true });
    appendFileSync(
      join(datumDir, "warnings.log"),
      `${(/* @__PURE__ */ new Date()).toISOString()} guard fail-open: ${message}
`
    );
  } catch {
  }
}
async function getVersion(busUrl, deadline) {
  const body = await busGet(`${busUrl}/version`, deadline);
  if (!body || typeof body.registry_version !== "number") return null;
  return body.registry_version;
}
async function getDeltas(busUrl, since, deadline) {
  const body = await busGet(`${busUrl}/deltas?since=${since}`, deadline);
  if (!body || !Array.isArray(body.deltas)) return null;
  return body.deltas;
}
async function busGet(url, deadline) {
  const remaining = deadline - Date.now();
  if (remaining <= 0) return null;
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), remaining);
  try {
    const res = await fetch(url, { signal: ac.signal });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
function withRelativeTime(reason, deltas) {
  const d = deltas[0];
  if (!d || !d.ts) return reason;
  const dt = Date.parse(d.ts);
  if (!Number.isFinite(dt)) return reason;
  const ago = relativeTime(Date.now() - dt);
  if (!ago) return reason;
  return reason.replace(/\)\./, `, ${ago}).`);
}
function relativeTime(ms) {
  if (!Number.isFinite(ms) || ms < 0) return null;
  const s = Math.round(ms / 1e3);
  if (s < 90) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 90) return `${m}m ago`;
  const h = Math.round(m / 60);
  return `${h}h ago`;
}
function readState(datumDir) {
  try {
    const file = join(datumDir, "state.json");
    return JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return {};
  }
}
function readStdin() {
  return new Promise((resolveStdin) => {
    let data = "";
    if (process.stdin.isTTY) return resolveStdin("");
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => data += chunk);
    process.stdin.on("end", () => resolveStdin(data));
    process.stdin.on("error", () => resolveStdin(data));
  });
}
function emit(obj) {
  process.stdout.write(JSON.stringify(obj));
}
function errMsg(err) {
  return err instanceof Error ? err.message : String(err);
}
var isMain = runAsEntry(import.meta.url, "guard");
if (isMain) {
  main().then((code) => process.exit(code)).catch(() => {
    process.exit(EXIT_ALLOW);
  });
}
