// hooks/datum-claim.ts
import { readFileSync, writeFileSync, appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

// server/entry.ts
import { resolve } from "node:path";
function runAsEntry(moduleUrl, id) {
  try {
    if ("claim") {
      return "claim" === id;
    }
  } catch {
  }
  try {
    return moduleUrl === `file://${resolve(process.argv[1] ?? "")}`;
  } catch {
    return false;
  }
}

// hooks/datum-claim.ts
var BUS_BUDGET_MS = 1e3;
async function main() {
  const raw = await readStdin();
  let input = {};
  try {
    input = raw ? JSON.parse(raw) : {};
  } catch {
    return;
  }
  const cwd = input.cwd || process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const datumDir = join(cwd, ".datum");
  const statePath = join(datumDir, "state.json");
  const state = readState(statePath);
  const busUrl = state.bus_url || process.env.DATUM_BUS_URL || "http://127.0.0.1:4317";
  const sessionId = input.session_id || state.session_id || "";
  const toolResponse = input.tool_response ?? input.tool_output ?? {};
  const ti = input.tool_input ?? {};
  const path = String(ti.file_path ?? ti.path ?? "");
  const toolName = input.tool_name ?? "Edit";
  const after = editContent(ti, toolResponse);
  const before = typeof ti.old_string === "string" ? ti.old_string : null;
  const why = leadingComment(after);
  const summary = firstLine(after);
  if (!path) return;
  const deadline = Date.now() + BUS_BUDGET_MS;
  let events = null;
  try {
    events = await postEvent(busUrl, deadline, {
      type: "edit.streamed",
      session_id: sessionId,
      human: state.human ?? "",
      tool_name: toolName,
      path,
      before,
      after,
      // FULL content so the bus can parse the contract change
      ...why ? { why } : {},
      summary
    });
  } catch (err) {
    return failOpen(datumDir, `bus /events error: ${errMsg(err)}`);
  }
  if (!events || typeof events.registry_version !== "number") {
    return failOpen(datumDir, `bus /events unreachable at ${busUrl}`);
  }
  const registryVersion = events.registry_version;
  if (sessionId) {
    await patchSession(busUrl, deadline, sessionId, registryVersion);
  }
  writeState(statePath, { ...state, last_synced_version: registryVersion });
  emit({
    hookSpecificOutput: {
      hookEventName: "PostToolUse",
      additionalContext: `datum: synced to v${registryVersion}`
    }
  });
}
var MAX_CONTENT = 64 * 1024;
function editContent(ti, toolResponse) {
  const content = String(
    ti.new_string ?? ti.content ?? ti.file_text ?? ti.command ?? toolResponse.content ?? ""
  );
  return content.length > MAX_CONTENT ? content.slice(0, MAX_CONTENT) : content;
}
function firstLine(content) {
  const fl = content.split("\n").map((l) => l.trim()).find((l) => l.length > 0) ?? "";
  return fl.length > 200 ? fl.slice(0, 197) + "..." : fl;
}
function leadingComment(content) {
  for (const raw of content.split("\n")) {
    const l = raw.trim();
    if (!l) continue;
    const m = l.match(/^(?:--|\/\/|#)\s*(.+)$/);
    return m ? m[1].trim() : "";
  }
  return "";
}
async function postEvent(busUrl, deadline, payload) {
  const remaining = deadline - Date.now();
  if (remaining <= 0) return null;
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), remaining);
  try {
    const res = await fetch(`${busUrl}/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: ac.signal
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
async function patchSession(busUrl, deadline, sessionId, version) {
  const remaining = deadline - Date.now();
  if (remaining <= 0) return;
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), remaining);
  try {
    await fetch(`${busUrl}/sessions/${encodeURIComponent(sessionId)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ last_synced_version: version }),
      signal: ac.signal
    });
  } catch {
  } finally {
    clearTimeout(timer);
  }
}
function failOpen(datumDir, message) {
  try {
    mkdirSync(datumDir, { recursive: true });
    appendFileSync(
      join(datumDir, "warnings.log"),
      `${(/* @__PURE__ */ new Date()).toISOString()} claim fail-open: ${message}
`
    );
  } catch {
  }
}
function readState(statePath) {
  try {
    return JSON.parse(readFileSync(statePath, "utf8"));
  } catch {
    return {};
  }
}
function writeState(statePath, state) {
  try {
    mkdirSync(join(statePath, ".."), { recursive: true });
    writeFileSync(statePath, JSON.stringify(state, null, 2) + "\n", "utf8");
  } catch {
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
var isMain = runAsEntry(import.meta.url, "claim");
if (isMain) {
  main().catch(() => {
  }).finally(() => process.exit(0));
}
