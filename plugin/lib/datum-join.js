// hooks/datum-join.ts
import { readFileSync as readFileSync3, writeFileSync as writeFileSync3, appendFileSync, mkdirSync as mkdirSync2 } from "node:fs";
import { join as join3 } from "node:path";
import { randomUUID } from "node:crypto";

// server/entry.ts
import { resolve } from "node:path";
function runAsEntry(moduleUrl, id) {
  try {
    if ("join") {
      return "join" === id;
    }
  } catch {
  }
  try {
    return moduleUrl === `file://${resolve(process.argv[1] ?? "")}`;
  } catch {
    return false;
  }
}

// cli/lib/git.ts
import { execFileSync } from "node:child_process";
import { basename } from "node:path";
function git(cwd, args) {
  try {
    const out = execFileSync("git", ["-C", cwd, ...args], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 2e3
    });
    const trimmed = out.trim();
    return trimmed.length ? trimmed : null;
  } catch {
    return null;
  }
}
function repoRoot(cwd) {
  return git(cwd, ["rev-parse", "--show-toplevel"]);
}
function normalizeRemote(url) {
  let s = url.trim();
  if (!s) return null;
  const hadScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(s);
  s = s.replace(/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//, "");
  s = s.replace(/^[^/@]+@/, "");
  if (!hadScheme) {
    const colon = s.indexOf(":");
    if (colon !== -1 && !/^[^/]+:\d+(\/|$)/.test(s)) {
      s = s.slice(0, colon) + "/" + s.slice(colon + 1);
    }
  }
  s = s.replace(/^([^/:]+):\d+(\/|$)/, "$1$2");
  s = s.replace(/\/{2,}/g, "/").replace(/\.git$/i, "").replace(/\/+$/, "");
  if (!s || !s.includes("/")) return null;
  return s;
}
function deriveWorkspaceId(cwd) {
  const remote = git(cwd, ["remote", "get-url", "origin"]);
  if (remote) {
    const norm = normalizeRemote(remote);
    if (norm) return norm;
  }
  const root = repoRoot(cwd) || cwd;
  return `local/${basename(root) || "workspace"}`;
}
function gitUserName(cwd) {
  return git(cwd, ["config", "user.name"]) || process.env.USER || "someone";
}
function gitUserEmail(cwd) {
  return git(cwd, ["config", "user.email"]) || "";
}
function currentBranch(cwd) {
  const b = git(cwd, ["rev-parse", "--abbrev-ref", "HEAD"]);
  if (b && b !== "HEAD") return b;
  const sym = git(cwd, ["symbolic-ref", "--short", "HEAD"]);
  if (sym) return sym;
  return "main";
}

// cli/lib/config.ts
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
var DEFAULT_BUS_URL = "http://127.0.0.1:4317";
var DEFAULT_SPEC_PATH = "docs/spec.md";
function configPath(dir) {
  return join(dir, "datum.json");
}
function readConfig(dir) {
  const path = configPath(dir);
  if (!existsSync(path)) return null;
  try {
    const raw = JSON.parse(readFileSync(path, "utf8"));
    return normalize(raw);
  } catch {
    return null;
  }
}
function normalize(raw) {
  return {
    workspace: typeof raw.workspace === "string" && raw.workspace ? raw.workspace : "auto",
    bus_url: typeof raw.bus_url === "string" && raw.bus_url ? raw.bus_url : DEFAULT_BUS_URL,
    watchlist: raw.watchlist && typeof raw.watchlist === "object" ? raw.watchlist : void 0,
    spec_path: typeof raw.spec_path === "string" && raw.spec_path ? raw.spec_path : DEFAULT_SPEC_PATH
  };
}

// cli/lib/state.ts
import { readFileSync as readFileSync2, writeFileSync as writeFileSync2, mkdirSync, existsSync as existsSync2 } from "node:fs";
import { join as join2, dirname } from "node:path";
var DEFAULT_BUS_URL2 = "http://127.0.0.1:4317";
function projectDir() {
  return process.env.CLAUDE_PROJECT_DIR || process.cwd();
}
function statePath(dir = projectDir()) {
  return join2(dir, ".datum", "state.json");
}
function readState(dir = projectDir()) {
  const path = statePath(dir);
  if (!existsSync2(path)) return null;
  try {
    const raw = JSON.parse(readFileSync2(path, "utf8"));
    return normalize2(raw);
  } catch {
    return null;
  }
}
function normalize2(raw) {
  return {
    session_id: raw.session_id ?? "",
    human: raw.human ?? "",
    email: raw.email ?? "",
    branch: raw.branch ?? "",
    workspace_id: raw.workspace_id ?? "",
    last_synced_version: Number(raw.last_synced_version ?? 0),
    claim_files: Array.isArray(raw.claim_files) ? raw.claim_files.map(String) : [],
    claim_symbols: Array.isArray(raw.claim_symbols) ? raw.claim_symbols.map(String) : [],
    bus_url: raw.bus_url || DEFAULT_BUS_URL2
  };
}
function writeState(state, dir = projectDir()) {
  const path = statePath(dir);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync2(path, JSON.stringify(state, null, 2) + "\n", "utf8");
}

// hooks/datum-join.ts
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
  const datumDir = join3(cwd, ".datum");
  const statePath2 = join3(datumDir, "state.json");
  seedStateIfNeeded(cwd, input.session_id);
  const state = readState2(statePath2);
  const busUrl = state.bus_url || process.env.DATUM_BUS_URL || "http://127.0.0.1:4317";
  const sessionId = input.session_id || state.session_id || "";
  const deadline = Date.now() + BUS_BUDGET_MS;
  let body = null;
  try {
    body = await postSession(busUrl, deadline, {
      session_id: sessionId,
      human: state.human ?? "",
      email: state.email ?? "",
      branch: state.branch ?? "",
      workspace_id: state.workspace_id ?? "",
      claim_files: state.claim_files ?? [],
      claim_symbols: state.claim_symbols ?? []
    });
  } catch (err) {
    return failOpen(datumDir, `bus error: ${errMsg(err)}`);
  }
  if (!body || typeof body.registry_version !== "number") {
    return failOpen(datumDir, `bus /sessions unreachable at ${busUrl}`);
  }
  const registryVersion = body.registry_version;
  const contracts = body.snapshot?.contracts ?? [];
  writeState2(statePath2, { ...state, session_id: sessionId || state.session_id, last_synced_version: registryVersion });
  let additionalContext = renderSnapshot(registryVersion, contracts, (body.advisories ?? []).length);
  if (body.warning) {
    additionalContext += ` datum: ${body.warning}.`;
  }
  emit({
    hookSpecificOutput: {
      hookEventName: "SessionStart",
      additionalContext
    }
  });
}
function renderSnapshot(version, contracts, advisoryCount) {
  const head = `datum: synced to v${version}`;
  if (contracts.length === 0) return `${head}.`;
  const list = contracts.map((c) => `${c.id} v${c.current_version}`).join(", ");
  const adv = advisoryCount > 0 ? ` ${advisoryCount} advisory${advisoryCount === 1 ? "" : "(s)"} pending.` : "";
  return `${head}; contracts: ${list}.${adv}`;
}
async function postSession(busUrl, deadline, payload) {
  const remaining = deadline - Date.now();
  if (remaining <= 0) return null;
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), remaining);
  try {
    const res = await fetch(`${busUrl}/sessions`, {
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
function failOpen(datumDir, message) {
  try {
    mkdirSync2(datumDir, { recursive: true });
    appendFileSync(
      join3(datumDir, "warnings.log"),
      `${(/* @__PURE__ */ new Date()).toISOString()} join fail-open: ${message}
`
    );
  } catch {
  }
}
function seedStateIfNeeded(cwd, sessionId) {
  try {
    const existing = readState(cwd);
    if (existing && existing.session_id && existing.human && existing.workspace_id) {
      return;
    }
    const committed = readConfig(cwd)?.bus_url;
    const busUrl = committed || process.env.DATUM_BUS_URL || "http://127.0.0.1:4317";
    writeState(
      {
        session_id: existing?.session_id || sessionId || randomUUID(),
        human: existing?.human || gitUserName(cwd),
        email: existing?.email || gitUserEmail(cwd),
        branch: existing?.branch || currentBranch(cwd),
        workspace_id: existing?.workspace_id || deriveWorkspaceId(cwd),
        last_synced_version: existing?.last_synced_version ?? 0,
        claim_files: existing?.claim_files ?? [],
        claim_symbols: existing?.claim_symbols ?? [],
        bus_url: existing?.bus_url || busUrl
      },
      cwd
    );
  } catch {
  }
}
function readState2(statePath2) {
  try {
    return JSON.parse(readFileSync3(statePath2, "utf8"));
  } catch {
    return {};
  }
}
function writeState2(statePath2, state) {
  try {
    mkdirSync2(join3(statePath2, ".."), { recursive: true });
    writeFileSync3(statePath2, JSON.stringify(state, null, 2) + "\n", "utf8");
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
var isMain = runAsEntry(import.meta.url, "join");
if (isMain) {
  main().catch(() => {
  }).finally(() => process.exit(0));
}
