#!/usr/bin/env node
// demo/datum-demo.ts — the HEADLESS datum demo runner + verifier.
//
//   node demo/datum-demo.ts        (cli `datum demo` delegates here)
//
// Boots an EPHEMERAL in-process bus + seedScenario(store) at epoch 7, then drives
// the workspace-invites scenario on the REAL deterministic path and asserts the
// SIX RUBRIC predicates, printing a green checklist. Exits 0 only if ALL hold,
// else exits 1 naming which failed.
//
// not-a-dashboard: this NEVER starts the web tower. The fence, advisory delivery,
// reconcile, and spec PR all happen on the terminal path with the web app stopped.
//
// The path, step by step:
//   1. POST asha's migration edit through the bus -> applyEdit bumps 7->8 +
//      delta.detected; GET /version -> 8 (predicate 1: registry advances to v8).
//   2. decideFence for ben's stale `.email` write -> DENY -> emit EXACTLY ONE
//      write.fenced (predicate 2).
//   3. run the arbiter (default real Opus modelClient; on ANY model error fall
//      back to a deterministic fixture pair so the gate still exits 0, and LOG
//      which path ran) -> two advisory.delivered that DIFFER + name each
//      recipient's file (predicates 3 + 4).
//   4. ben's corrected contact_email write -> server reconciled (per-session);
//      chen's clean write -> server reconciled + workspace reconciled. (LIVE
//      server path — RECONCILIATION #1: reconciled is server-emitted, not scripted.)
//   5. openSpecPR(delta, ledgerId=112, {repoDir, useGh:false}) -> one
//      spec.pr.opened #14 patching docs/spec.md (predicate 5).
//   6. REAL git merge of asha/schema, ben/api, chen/ui into a fresh integration
//      branch -> assert no conflict (predicate 6).
//
// Idempotent + re-runnable: the bus is in-memory (:memory:), the seed repo is
// rebuilt each run, and the merge happens on a fresh throwaway branch.
//
// DATUM_DEMO_BREAK=<predicate> forces one predicate to fail (test negative case):
//   epoch | fence | advisories | differ | specpr | merge | model
//
// Node built-ins only. The bus + every deterministic step is model-free; the
// ONLY model touch is the arbiter advisory prose (off the critical path).

import { spawnSync } from "node:child_process";

import { createBus } from "../server/bus.ts";
import { seedScenario } from "../server/seed.ts";
import { decideFence } from "../server/fence.ts";
import { runArbiter, defaultModelClient } from "../server/arbiter/index.ts";
import type { Advisory, ModelClient } from "../server/arbiter/advise.ts";
import { openSpecPR } from "../server/arbiter/spec-pr.ts";
import type { Delta, Store } from "../server/store.ts";
import type { PromptPayload } from "../server/arbiter/prompt.ts";

import { buildWorkspaceRepo } from "./seed.ts";
import {
  SESSION_IDS,
  ASHA_MIGRATION_PATH,
  ASHA_EDIT_AFTER,
  ASHA_EDIT_WHY,
  BEN_SELF_CORRECTION,
  CHEN_RECONCILE,
} from "./scenario.ts";

const LEDGER_ID = 112;
const BREAK = process.env.DATUM_DEMO_BREAK ?? "";

// ---- the six predicates (RUBRIC / demo PRD acceptance) ----

type PredicateKey =
  | "epoch_v8"
  | "exactly_one_fenced"
  | "two_advisories"
  | "advisories_differ"
  | "one_spec_pr"
  | "three_branches_merge";

const PREDICATE_LABEL: Record<PredicateKey, string> = {
  epoch_v8: "registry advances to v8",
  exactly_one_fenced: "exactly one write is fenced",
  two_advisories: "two advisories are delivered",
  advisories_differ: "the two advisories differ",
  one_spec_pr: "one spec PR is opened",
  three_branches_merge: "three branches merge clean",
};

type PredicateResult = { key: PredicateKey; ok: boolean; detail: string };

// ---- small HTTP helpers against the ephemeral bus ----

async function busPost(busUrl: string, path: string, body: unknown): Promise<Record<string, unknown>> {
  const res = await fetch(`${busUrl}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return (await res.json()) as Record<string, unknown>;
}

async function busGet(busUrl: string, path: string): Promise<Record<string, unknown>> {
  const res = await fetch(`${busUrl}${path}`);
  return (await res.json()) as Record<string, unknown>;
}

// ---- deterministic fallback advisory client (used iff the real model fails) ----
//
// schema §6 verbatim seeded bodies (ben fence / chen advisory). Returned as a
// JSON {body, actions} blob so advise()'s parser yields exactly these. Each body
// differs; each carries >=1 action. This keeps the gate green offline while the
// real Opus client is exercised first and only swapped on error.

const FIXTURE_BODY: Record<string, { body: string; actions: string[] }> = {
  ben: {
    body: "users.email is now contact_email (migration 0042, asha). Your open diff selects .email in two queries; update both before your next write.",
    actions: ["update both .email queries to contact_email", "re-sync to v8"],
  },
  chen: {
    body: "UserDTO.email renamed; regenerate types from the API client. UserCard.tsx line 18 reads user.email and will break at runtime.",
    actions: [
      "regenerate DTO types from the API client",
      "read user.contact_email in UserCard.tsx",
      "re-sync to v8",
    ],
  },
};

function makeFixtureClient(): ModelClient {
  return async (prompt: PromptPayload): Promise<string> => {
    const text = prompt.messages.map((m) => m.content.map((b) => b.text).join("\n")).join("\n");
    const recipient = /RECIPIENT:\s*(\w+)/.exec(text)?.[1] ?? "ben";
    const f = FIXTURE_BODY[recipient] ?? FIXTURE_BODY.ben;
    return JSON.stringify(f);
  };
}

// ---- model client: try the real Opus client, fall back to fixture on error ----

function makeResilientClient(state: { usedReal: boolean; usedFixture: boolean }): ModelClient {
  const fixture = makeFixtureClient();
  // DATUM_DEMO_BREAK=model OR DATUM_DEMO_FIXTURE=1 forces the deterministic
  // offline fixture (no network, no `claude` CLI). The predicate set + exit code
  // are unchanged by this — only the advisory PROSE source is. Tests use it to
  // run the negative cases fast + hermetically.
  const forceFixture = BREAK === "model" || process.env.DATUM_DEMO_FIXTURE === "1";
  return async (prompt: PromptPayload): Promise<string> => {
    if (forceFixture) {
      state.usedFixture = true;
      return fixture(prompt);
    }
    try {
      const out = await defaultModelClient(prompt);
      if (out && out.trim()) {
        state.usedReal = true;
        return out;
      }
      throw new Error("empty model output");
    } catch {
      state.usedFixture = true;
      return fixture(prompt);
    }
  };
}

// ---- the run ----

async function run(): Promise<number> {
  log("");
  log("datum demo — workspace-invites (headless, not-a-dashboard)");
  log("=".repeat(60));

  // ---- boot the ephemeral in-process bus at epoch 7 ----
  // createBus surfaces the store handle so we can seedScenario in-process; the
  // SAME store backs every HTTP round-trip (one bus, one store).
  const bus = await createBus({ port: 0, dbPath: ":memory:" });
  const busUrl = bus.url;
  const store: Store = bus.store;
  seedScenario(store);

  const predicates: PredicateResult[] = [];
  const modelState = { usedReal: false, usedFixture: false };

  try {
    // ===== STEP 1: asha migrates -> epoch 7 -> 8 + delta.detected =====
    log("");
    log("[1] asha lands migration 0042 (users.email -> contact_email)");
    const ashaResp = await busPost(busUrl, "/events", {
      type: "edit.streamed",
      payload: {
        session_id: SESSION_IDS.asha,
        human: "asha",
        tool_name: "Write",
        path: ASHA_MIGRATION_PATH,
        after: ASHA_EDIT_AFTER,
        why: ASHA_EDIT_WHY,
      },
    });
    const deltaPayload = ashaResp.delta as Record<string, unknown> | undefined;
    const versionResp = await busGet(busUrl, "/version");
    let epoch = Number(versionResp.registry_version);
    if (BREAK === "epoch") epoch = 7; // forced failure
    log(`    GET /version -> registry_version: ${epoch}`);
    predicates.push({
      key: "epoch_v8",
      ok: epoch === 8,
      detail: `registry_version=${epoch} (expected 8)`,
    });

    if (!deltaPayload) throw new Error("asha's migration did not produce a delta");
    const delta = fromDeltaPayload(deltaPayload);

    // ===== STEP 2: ben's stale .email write -> decideFence DENY -> write.fenced =====
    log("");
    log("[2] ben writes routes/users.ts still selecting .email -> fence");
    const deltasResp = await busGet(busUrl, `/deltas?since=7`);
    const deltas = ((deltasResp.deltas as Delta[]) ?? []).map((d) => d);
    const decision = decideFence({
      write: {
        path: BEN_SELF_CORRECTION.path,
        tool_name: "Edit",
        content: BEN_SELF_CORRECTION.staleContent,
      },
      lastSyncedVersion: 7,
      currentVersion: 8,
      deltas,
    });
    log(`    decideFence -> ${decision.decision}`);
    if (decision.decision === "deny") {
      log(`    reason: ${decision.reason}`);
      // emit EXACTLY ONE write.fenced (the PreToolUse deny). The Stop guard never
      // emits a bus event; this is the single honest write.fenced for the run.
      await busPost(busUrl, "/events", {
        type: "write.fenced",
        payload: {
          session_id: SESSION_IDS.ben,
          human: "ben",
          path: BEN_SELF_CORRECTION.path,
          delta_epoch: delta.epoch,
          contract_id: delta.contract_id,
          reason: decision.reason,
        },
      });
    }
    if (BREAK === "fence") {
      // forced failure: emit a bogus SECOND fenced event so the count != 1.
      await busPost(busUrl, "/events", {
        type: "write.fenced",
        payload: {
          session_id: "sess-ben",
          human: "ben",
          path: "x",
          delta_epoch: 8,
          contract_id: "db.users",
          reason: "dup",
        },
      });
    }
    const fencedCount = countEvents(store, "write.fenced");
    log(`    write.fenced events on bus: ${fencedCount}`);
    predicates.push({
      key: "exactly_one_fenced",
      ok: decision.decision === "deny" && fencedCount === 1,
      detail: `decision=${decision.decision}, write.fenced count=${fencedCount} (expected exactly 1)`,
    });

    // ===== STEP 3: arbiter -> two advisories that DIFFER + name each file =====
    log("");
    log("[3] arbiter delivers tailored advisories (real Opus, fixture on error)");
    const client = makeResilientClient(modelState);
    let advisories: Advisory[] = await runArbiter(store, delta, { modelClient: client });
    const sourceLabel = modelState.usedReal
      ? modelState.usedFixture
        ? "real Opus + deterministic fixture"
        : "real Opus"
      : "deterministic fixture";
    log(`    advisory source: ${sourceLabel}`);

    if (BREAK === "advisories") advisories = advisories.slice(0, 1); // force only one
    if (BREAK === "differ" && advisories.length >= 2) {
      advisories = advisories.map((a) => ({ ...a, body: "SAME BODY" }));
    }

    const ben = advisories.find((a) => a.recipient === "ben");
    const chen = advisories.find((a) => a.recipient === "chen");
    for (const a of advisories) {
      log(`    -> ${a.recipient} [${a.severity}] ${a.file}: ${truncate(a.body, 72)}`);
    }
    predicates.push({
      key: "two_advisories",
      ok: advisories.length === 2,
      detail: `advisories=${advisories.length} (expected 2)`,
    });
    const filesNamed = ben?.file === "routes/users.ts" && chen?.file === "UserCard.tsx";
    const bodiesDiffer = !!ben && !!chen && ben.body !== chen.body;
    predicates.push({
      key: "advisories_differ",
      ok: bodiesDiffer && filesNamed,
      detail: `ben.body!==chen.body=${bodiesDiffer}, files named=${filesNamed}`,
    });

    // ===== STEP 4: live reconcile — ben self-corrects, then chen (server-emitted) =====
    log("");
    log("[4] ben self-corrects to contact_email -> server reconciles");
    await busPost(busUrl, "/events", {
      type: "edit.streamed",
      payload: {
        session_id: SESSION_IDS.ben,
        human: "ben",
        tool_name: "Edit",
        path: BEN_SELF_CORRECTION.path,
        after: BEN_SELF_CORRECTION.correctedContent,
      },
    });
    log("    chen adopts contact_email in UserCard.tsx -> server reconciles");
    await busPost(busUrl, "/events", {
      type: "edit.streamed",
      payload: {
        session_id: SESSION_IDS.chen,
        human: "chen",
        tool_name: "Edit",
        path: CHEN_RECONCILE.path,
        after: CHEN_RECONCILE.correctedContent,
      },
    });
    const reconciledCount = countEvents(store, "reconciled");
    const workspaceReconciled = store
      .getEventsSince(0)
      .some((e) => e.type === "reconciled" && (e.payload as { workspace?: boolean }).workspace === true);
    log(`    reconciled events on bus: ${reconciledCount} (workspace=${workspaceReconciled})`);

    // ===== STEP 5: openSpecPR -> one spec.pr.opened #14 patching docs/spec.md =====
    log("");
    log("[5] open spec PR (patch docs/spec.md, link ledger #112)");
    const repo = buildWorkspaceRepo();
    const pr = await openSpecPR(delta, LEDGER_ID, {
      repoDir: repo.dir,
      specPath: "docs/spec.md",
      useGh: false,
      busUrl,
    });
    log(`    PR #${pr.pr_number} -> ${pr.patch_path} (ledger #${pr.ledger_id})`);
    let specPrCount = countEvents(store, "spec.pr.opened");
    if (BREAK === "specpr") specPrCount = 0;
    predicates.push({
      key: "one_spec_pr",
      ok: specPrCount === 1 && pr.pr_number === 14 && pr.patch_path === "docs/spec.md",
      detail: `spec.pr.opened count=${specPrCount}, pr_number=${pr.pr_number}, patch_path=${pr.patch_path}`,
    });

    // ===== STEP 6: REAL git merge of the three branches (must be clean) =====
    log("");
    log("[6] real git merge: asha/schema + ben/api + chen/ui -> integration");
    const mergeOk = mergeThreeBranches(repo.dir, repo.base, repo.branches, BREAK === "merge");
    log(`    merge clean: ${mergeOk.ok}${mergeOk.ok ? "" : " (conflict: " + mergeOk.detail + ")"}`);
    predicates.push({
      key: "three_branches_merge",
      ok: mergeOk.ok,
      detail: mergeOk.detail,
    });
  } finally {
    await bus.close();
  }

  // ---- the green checklist ----
  log("");
  log("checklist (six predicates):");
  log("-".repeat(60));
  let allOk = true;
  for (const p of predicates) {
    const mark = p.ok ? "PASS" : "FAIL";
    if (!p.ok) allOk = false;
    log(`  [${mark}] ${PREDICATE_LABEL[p.key]} — ${p.detail}`);
  }
  log("-".repeat(60));
  log("not-a-dashboard: no tower process started (web app stopped throughout).");

  if (allOk && predicates.length === 6) {
    log("");
    log("ALL SIX PREDICATES HOLD — datum demo green. exit 0.");
    return 0;
  }
  const failed = predicates.filter((p) => !p.ok).map((p) => p.key);
  log("");
  log(`DEMO FAILED — predicates not holding: ${failed.join(", ") || "(incomplete run)"}. exit 1.`);
  return 1;
}

// ---- helpers ----

function fromDeltaPayload(p: Record<string, unknown>): Delta {
  return {
    epoch: Number(p.epoch),
    contract_id: String(p.contract_id),
    from_version: Number(p.from_version),
    to_version: Number(p.to_version),
    author: String(p.author),
    ts: String(p.ts),
    why: String(p.why),
    mechanical_change: p.mechanical_change as Delta["mechanical_change"],
  };
}

/** Count events of a type off the server-owned event log (the source of truth). */
function countEvents(store: Store, type: string): number {
  return store.getEventsSince(0).filter((e) => e.type === type).length;
}

function git(dir: string, args: string[]): { ok: boolean; out: string; err: string } {
  const r = spawnSync("git", args, { cwd: dir, encoding: "utf8" });
  return { ok: r.status === 0, out: (r.stdout ?? "").trim(), err: (r.stderr ?? "").trim() };
}

function mergeThreeBranches(
  dir: string,
  base: string,
  branches: { asha: string; ben: string; chen: string },
  forceConflict: boolean,
): { ok: boolean; detail: string } {
  const integration = `datum/integration-${Date.now()}`;
  const co = git(dir, ["checkout", "-q", "-B", integration, base]);
  if (!co.ok) return { ok: false, detail: `checkout failed: ${co.err}` };

  if (forceConflict) {
    // create a conflicting commit on integration touching a file ben also changes.
    git(dir, ["rm", "-q", "routes/users.ts"]);
    git(dir, [
      "-c",
      "user.email=datum@local",
      "-c",
      "user.name=datum-demo",
      "commit",
      "-q",
      "-m",
      "force conflict (remove routes/users.ts)",
    ]);
  }

  const order = [branches.asha, branches.ben, branches.chen];
  for (const b of order) {
    const m = git(dir, [
      "-c",
      "user.email=datum@local",
      "-c",
      "user.name=datum-demo",
      "merge",
      "--no-edit",
      "--no-ff",
      b,
    ]);
    if (!m.ok) {
      git(dir, ["merge", "--abort"]);
      git(dir, ["checkout", "-q", base]);
      return { ok: false, detail: `merge of ${b} conflicted: ${m.err || m.out}` };
    }
  }
  git(dir, ["checkout", "-q", base]);
  return { ok: true, detail: `merged ${order.join(", ")} clean onto ${integration}` };
}

function truncate(s: string, n: number): string {
  const flat = s.replace(/\s+/g, " ").trim();
  return flat.length > n ? flat.slice(0, n) + "..." : flat;
}

function log(msg: string): void {
  // eslint-disable-next-line no-console
  console.log(msg);
}

// ---- main ----

run()
  .then((code) => process.exit(code))
  .catch((err) => {
    log(
      `datum demo: fatal error: ${
        err && (err as Error).message ? (err as Error).message : String(err)
      }`,
    );
    process.exit(1);
  });
