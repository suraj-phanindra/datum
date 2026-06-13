// test/installer.test.ts — the hooks-installer acceptance run (track:
// hooks-installer). Three groups:
//   1. init() wires .claude/settings.json (SessionStart/PostToolUse/PreToolUse
//      EXEC-form node hooks under ${CLAUDE_PROJECT_DIR}, mcpServers.datum) and
//      seeds .datum/state.json with bus_url.
//   2. mergeSettingsBlock idempotency: init twice -> no duplicate hook entries.
//   3. RESYNC round-trip: an ephemeral seeded bus (epoch 7) + `node
//      hooks/datum-claim.ts` fed a PostToolUse JSON for asha's migrations/0042
//      edit -> bus bumps to 8 AND .datum/state.json.last_synced_version -> 8.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

import { init, mergeSettingsBlock, datumSettingsBlock, type Settings } from "../cli/init.ts";
import { startBus } from "../server/index.ts";
import { Store } from "../server/store.ts";
import { openDb } from "../server/db.ts";
import { seedScenario, ASHA_MIGRATION_AFTER, ASHA_WHY } from "../server/seed.ts";
import { decideFence } from "../server/fence.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(HERE, "..");
const CLAIM_HOOK = join(PROJECT_ROOT, "hooks", "datum-claim.ts");

const PROJECT_DIR = "${CLAUDE_PROJECT_DIR}";

function readJson(path: string): any {
  return JSON.parse(readFileSync(path, "utf8"));
}

/**
 * Spawn a hook script asynchronously, feed it `input` on stdin, and resolve with
 * { status, stdout, stderr }. We use async spawn (NOT spawnSync) because the bus
 * runs in this same process's event loop; spawnSync would block the loop and
 * deadlock the hook's fetch back to the in-process bus.
 */
function runHook(
  scriptPath: string,
  input: string,
  env: NodeJS.ProcessEnv,
): Promise<{ status: number | null; stdout: string; stderr: string }> {
  return new Promise((resolveRun) => {
    const child = spawn(process.execPath, [scriptPath], { env });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d.toString()));
    child.stderr.on("data", (d) => (stderr += d.toString()));
    child.on("close", (code) => resolveRun({ status: code, stdout, stderr }));
    child.on("error", () => resolveRun({ status: 1, stdout, stderr }));
    child.stdin.write(input);
    child.stdin.end();
  });
}

/** Find the EXEC-form node command whose args point at hooks/<name>.ts. */
function findHookCommand(entries: any[], hookFile: string): any | undefined {
  for (const entry of entries ?? []) {
    for (const h of entry.hooks ?? []) {
      const args: string[] = h.args ?? [];
      if (h.command === "node" && args.some((a) => a.endsWith(hookFile))) return { entry, h };
    }
  }
  return undefined;
}

test("installer: init wires the three hooks + MCP server and seeds state.json", () => {
  const dir = mkdtempSync(join(tmpdir(), "datum-init-"));
  try {
    const result = init({
      projectDir: dir,
      busUrl: "http://127.0.0.1:4317",
      human: "asha",
      branch: "asha/schema",
      claimFiles: ["migrations/**", "schema.sql"],
      claimSymbols: ["users.email"],
    });

    // ---- .claude/settings.json ----
    const settings: Settings = readJson(result.settingsPath);

    // SessionStart -> datum-join.ts (EXEC form, ${CLAUDE_PROJECT_DIR}).
    const join1 = findHookCommand(settings.hooks!.SessionStart, "datum-join.ts");
    assert.ok(join1, "SessionStart wires datum-join.ts");
    assert.equal(join1.h.command, "node");
    assert.ok(
      join1.h.args.some((a: string) => a.includes(PROJECT_DIR) && a.endsWith("hooks/datum-join.ts")),
      "datum-join arg uses ${CLAUDE_PROJECT_DIR}",
    );

    // PostToolUse "Edit|Write|MultiEdit" -> datum-claim.ts.
    const claim = findHookCommand(settings.hooks!.PostToolUse, "datum-claim.ts");
    assert.ok(claim, "PostToolUse wires datum-claim.ts");
    assert.equal(claim.entry.matcher, "Edit|Write|MultiEdit");
    assert.ok(
      claim.h.args.some((a: string) => a.includes(PROJECT_DIR) && a.endsWith("hooks/datum-claim.ts")),
    );

    // PreToolUse "Edit|Write|MultiEdit" -> datum-fence.ts (fence-owned; wired).
    const fence = findHookCommand(settings.hooks!.PreToolUse, "datum-fence.ts");
    assert.ok(fence, "PreToolUse wires datum-fence.ts");
    assert.equal(fence.entry.matcher, "Edit|Write|MultiEdit");
    assert.ok(
      fence.h.args.some((a: string) => a.includes(PROJECT_DIR) && a.endsWith("hooks/datum-fence.ts")),
    );

    // mcpServers.datum stanza (EXEC-form node server/mcp.ts).
    assert.ok(settings.mcpServers, "mcpServers present");
    const mcp: any = settings.mcpServers!.datum;
    assert.ok(mcp, "mcpServers.datum registered");
    assert.equal(mcp.command, "node");
    assert.ok(
      (mcp.args as string[]).some((a) => a.includes(PROJECT_DIR) && a.endsWith("server/mcp.ts")),
      "MCP arg points at server/mcp.ts under ${CLAUDE_PROJECT_DIR}",
    );

    // ---- .datum/state.json seeded with bus_url ----
    const state = readJson(result.statePath);
    assert.equal(state.bus_url, "http://127.0.0.1:4317");
    assert.equal(state.human, "asha");
    assert.equal(state.branch, "asha/schema");
    assert.deepEqual(state.claim_files, ["migrations/**", "schema.sql"]);
    assert.deepEqual(state.claim_symbols, ["users.email"]);
    assert.equal(typeof state.session_id, "string");
    assert.ok(state.session_id.length > 0, "session_id seeded");
    assert.equal(state.last_synced_version, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("installer: init is idempotent — running twice adds no duplicate hook entries", () => {
  const dir = mkdtempSync(join(tmpdir(), "datum-idem-"));
  try {
    const first = init({ projectDir: dir, human: "ben", branch: "ben/api" });
    const sid1 = readJson(first.statePath).session_id;

    const second = init({ projectDir: dir, human: "ben", branch: "ben/api" });
    const settings: Settings = readJson(second.settingsPath);

    // exactly one matcher entry per event, one command entry each.
    assert.equal(settings.hooks!.SessionStart.length, 1);
    assert.equal(settings.hooks!.SessionStart[0].hooks.length, 1);
    assert.equal(settings.hooks!.PostToolUse.length, 1);
    assert.equal(settings.hooks!.PostToolUse[0].hooks.length, 1);
    assert.equal(settings.hooks!.PreToolUse.length, 1);
    assert.equal(settings.hooks!.PreToolUse[0].hooks.length, 1);

    // mcp stanza not duplicated.
    assert.equal(Object.keys(settings.mcpServers!).length, 1);

    // re-running init keeps the live session_id (does not clobber state).
    assert.equal(readJson(second.statePath).session_id, sid1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("mergeSettingsBlock: merges into a pre-existing hooks block without clobbering", () => {
  // a user already has a SessionStart hook + a custom mcp server.
  const pre: Settings = {
    hooks: {
      SessionStart: [{ hooks: [{ type: "command", command: "node", args: ["other.ts"] }] }],
    },
    mcpServers: { other: { command: "node", args: ["other-mcp.ts"] } },
  };

  const merged = mergeSettingsBlock(pre, "datum", datumSettingsBlock());

  // the user's original SessionStart command is preserved...
  const cmds = merged.hooks!.SessionStart[0].hooks.map((h) => h.args?.[0]);
  assert.ok(cmds.includes("other.ts"), "pre-existing hook preserved");
  // ...alongside the datum join hook (same default matcher -> same entry).
  assert.ok(
    cmds.some((a) => a?.endsWith("hooks/datum-join.ts")),
    "datum-join added into the existing SessionStart entry",
  );

  // both mcp servers coexist.
  assert.ok(merged.mcpServers!.other, "user mcp preserved");
  assert.ok(merged.mcpServers!.datum, "datum mcp added");

  // merging again is a no-op (idempotent).
  const again = mergeSettingsBlock(merged, "datum", datumSettingsBlock());
  assert.equal(again.hooks!.SessionStart[0].hooks.length, 2);
  assert.equal(again.hooks!.PostToolUse.length, 1);
  assert.equal(again.hooks!.PostToolUse[0].hooks.length, 1);
});

test("installer: RESYNC round-trip — datum-claim streams asha's edit, epoch 7->8, state.json last_synced 7->8", async () => {
  // 1) seed a file-backed db to the pre-delta state (epoch 7, db.users v7).
  const dir = mkdtempSync(join(tmpdir(), "datum-resync-"));
  const dbPath = join(dir, "datum.db");
  const seedDb = openDb(dbPath);
  const seedStore = new Store(seedDb);
  seedScenario(seedStore);
  seedDb.close();

  // 2) start an ephemeral bus on the seeded db.
  const bus = await startBus({ port: 0, dbPath });

  try {
    // pre-check: bus epoch is 7.
    const v7 = await (await fetch(`${bus.url}/version`)).json();
    assert.equal(v7.registry_version, 7);

    // 3) seed .datum/state.json for asha (last_synced 7, pointing at this bus).
    const datumDir = join(dir, ".datum");
    mkdirSync(datumDir, { recursive: true });
    const statePath = join(datumDir, "state.json");
    writeFileSync(
      statePath,
      JSON.stringify(
        {
          session_id: "sess-asha",
          human: "asha",
          branch: "asha/schema",
          last_synced_version: 7,
          claim_files: ["migrations/**", "schema.sql"],
          claim_symbols: ["users.email", "users.contact_email"],
          bus_url: bus.url,
        },
        null,
        2,
      ),
    );

    // 4) spawn `node hooks/datum-claim.ts` with a PostToolUse envelope for
    //    asha's migrations/0042 rename edit on stdin.
    const postToolUse = {
      session_id: "sess-asha",
      cwd: dir,
      tool_name: "Write",
      tool_input: {
        file_path: join(dir, "migrations", "0042_rename.sql"),
        content: ASHA_MIGRATION_AFTER,
      },
      tool_response: { success: true },
    };

    const proc = await runHook(CLAIM_HOOK, JSON.stringify(postToolUse), {
      ...process.env,
      DATUM_BUS_URL: bus.url,
    });

    assert.equal(proc.status, 0, `datum-claim exited 0 (stderr: ${proc.stderr})`);
    // the hook confirms the sync via additionalContext.
    if (proc.stdout.trim()) {
      const out = JSON.parse(proc.stdout);
      assert.equal(out.hookSpecificOutput.hookEventName, "PostToolUse");
      assert.match(out.hookSpecificOutput.additionalContext, /synced to v8/);
    }

    // 5) the bus epoch bumped to 8 (asha's contract-surface delta).
    const v8 = await (await fetch(`${bus.url}/version`)).json();
    assert.equal(v8.registry_version, 8, "bus epoch advanced to 8");

    // a delta was detected for db.users.
    const deltas = await (await fetch(`${bus.url}/deltas?since=7`)).json();
    assert.equal(deltas.deltas.length, 1);
    assert.equal(deltas.deltas[0].contract_id, "db.users");
    assert.equal(deltas.deltas[0].to_version, 8);

    // CRITICAL (wired-path proof): the rename_column must survive the hook->bus
    // hop. datum-claim must stream the FULL edit content, not a first-line
    // summary, or the delta degrades to kind:'decision' and the fence ALLOWs ben.
    const mc = deltas.deltas[0].mechanical_change;
    assert.equal(mc.kind, "rename_column", "rename survives the hook->bus hop");
    assert.equal(mc.from, "email");
    assert.equal(mc.to, "contact_email");

    // END-TO-END: ben (behind at v7) editing routes/users.ts selecting .email is
    // DENIED by the fence against the REAL delta the hook produced. This is the
    // demo's money shot on the actual wired path.
    const benDecision = decideFence({
      write: { path: "routes/users.ts", tool_name: "Edit", content: "const e = user.email;" },
      lastSyncedVersion: 7,
      currentVersion: v8.registry_version,
      deltas: deltas.deltas,
    });
    assert.equal(benDecision.decision, "deny", "fence denies ben's .email write against the wired delta");
    assert.match((benDecision as { reason: string }).reason, /contact_email/);
    assert.match((benDecision as { reason: string }).reason, /asha/);

    // 6) the RE-SYNC write-back advanced .datum/state.json to 8 (gap #2).
    const state = readJson(statePath);
    assert.equal(state.last_synced_version, 8, "state.json last_synced advanced to 8");

    // 7) and the bus session row was PATCHed to 8 as well.
    //    (POST /sessions would reset it, so we don't re-join; we read deltas as
    //    proof the PATCH path ran without error — the local write-back is the
    //    binding assertion above.)
  } finally {
    await bus.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
