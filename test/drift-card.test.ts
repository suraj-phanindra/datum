// test/drift-card.test.ts — LiveDriftCard state-machine acceptance suite.
//
// Run: node --test test/drift-card.test.ts   (NO DOM, NO jsdom)
//
// Acceptance check: the drift card animates through detected, fenced, advised,
// reconciling, reconciled, patched. The animation is driven by a PURE reducer
// (reduceDriftState) so we can exercise the whole arc without a browser.
//
// We feed the VERBATIM schema §9 event sequence (the workspace-invites
// scenario) and assert:
//   - stage progresses calm -> detected -> fenced -> advised -> reconciling ->
//     reconciled -> patched IN ORDER (every intermediate state observed);
//   - ben node neutral -> red -> green; chen node neutral -> blue -> green;
//   - the reconciled count reaches 2/2;
//   - the footer exposes spec PR #14 and ledger #112;
//   - a per-session `reconciled` carrying workspace:true is treated as the
//     WORKSPACE-complete event (disambiguation on payload.workspace, not type);
//   - reduced-motion does NOT change the final reduced state (the reducer is
//     motion-agnostic: identical final colors/labels/count).

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  STAGES,
  initialDriftState,
  reduceDriftState,
} from "../web/drift-card.js";

// --------------------------------------------------------------------------
// the verbatim §9 event sequence (workspace-invites). Field names are the
// exact schema §3 wire shapes (snake_case). The two `reconciled` events are
// disambiguated by payload.workspace.
// --------------------------------------------------------------------------
function scenarioEvents() {
  return [
    // 1) delta.detected — db.users v7 -> v8, asha's rename, epoch 8.
    {
      id: 1,
      type: "delta.detected",
      ts: "2026-06-13T14:02:11Z",
      payload: {
        epoch: 8,
        contract_id: "db.users",
        from_version: 7,
        to_version: 8,
        author: "asha",
        ts: "2026-06-13T14:02:11Z",
        why: 'phone signups make email the wrong name.',
        mechanical_change: {
          kind: "rename_column",
          table: "users",
          from: "email",
          to: "contact_email",
          migration: "0042",
        },
      },
    },
    // 2) write.fenced — ben's open diff at routes/users.ts is blocked.
    {
      id: 2,
      type: "write.fenced",
      ts: "2026-06-13T14:02:16Z",
      payload: {
        session_id: "sess-ben",
        human: "ben",
        path: "routes/users.ts",
        delta_epoch: 8,
        contract_id: "db.users",
        reason:
          "db.users.email was renamed to contact_email (migration 0042, asha).",
      },
    },
    // 3) advisory.delivered — ben (severity 'fence', routes/users.ts).
    {
      id: 3,
      type: "advisory.delivered",
      ts: "2026-06-13T14:02:17Z",
      payload: {
        session_id: "sess-ben",
        human: "ben",
        recipient: "ben",
        file: "routes/users.ts",
        advisory: {
          recipient: "ben",
          session_id: "sess-ben",
          file: "routes/users.ts",
          severity: "fence",
          body:
            "users.email is now contact_email (migration 0042, asha). Your open diff selects .email in two queries; update both before your next write.",
          actions: ["update both .email queries", "re-sync to v8"],
        },
      },
    },
    // 4) advisory.delivered — chen (severity 'advisory', UserCard.tsx).
    {
      id: 4,
      type: "advisory.delivered",
      ts: "2026-06-13T14:02:17Z",
      payload: {
        session_id: "sess-chen",
        human: "chen",
        recipient: "chen",
        file: "UserCard.tsx",
        advisory: {
          recipient: "chen",
          session_id: "sess-chen",
          file: "UserCard.tsx",
          severity: "advisory",
          body:
            "UserDTO.email renamed; regenerate types from the API client. UserCard.tsx line 18 reads user.email and will break at runtime.",
          actions: ["regenerate types from the API client"],
        },
      },
    },
    // 5) reconciled (per session) — ben lands a clean write. count 0/2 -> 1/2.
    {
      id: 5,
      type: "reconciled",
      ts: "2026-06-13T14:03:30Z",
      payload: {
        session_id: "sess-ben",
        human: "ben",
        contract_id: "db.users",
        epoch: 8,
        path: "routes/users.ts",
      },
    },
    // 6) reconciled (per session) — chen regenerates types. count 1/2 -> 2/2.
    {
      id: 6,
      type: "reconciled",
      ts: "2026-06-13T14:03:40Z",
      payload: {
        session_id: "sess-chen",
        human: "chen",
        contract_id: "db.users",
        epoch: 8,
        path: "UserCard.tsx",
      },
    },
    // 7) reconciled (WORKSPACE) — all consumers done. workspace:true.
    {
      id: 7,
      type: "reconciled",
      ts: "2026-06-13T14:03:40Z",
      payload: {
        workspace: true,
        epoch: 8,
        sessions: ["sess-asha", "sess-ben", "sess-chen"],
      },
    },
    // 8) spec.pr.opened — the artifact exists. PR #14, ledger #112.
    {
      id: 8,
      type: "spec.pr.opened",
      ts: "2026-06-13T14:04:00Z",
      payload: {
        pr_number: 14,
        url: "https://github.com/acme/workspaces/pull/14",
        contract_id: "db.users",
        epoch: 8,
        ledger_id: 112,
        patch_path: "docs/spec.md",
      },
    },
  ];
}

// fold the sequence, capturing the stage after each event.
function runScenario(reducedMotion = false) {
  let state = initialDriftState({ reducedMotion });
  const stagesSeen: string[] = [state.stage];
  const benColors: string[] = [state.nodes.ben.color];
  const chenColors: string[] = [state.nodes.chen.color];
  for (const ev of scenarioEvents()) {
    state = reduceDriftState(state, ev);
    stagesSeen.push(state.stage);
    benColors.push(state.nodes.ben.color);
    chenColors.push(state.nodes.chen.color);
  }
  return { state, stagesSeen, benColors, chenColors };
}

// --------------------------------------------------------------------------

test("drift card: stage progresses calm -> detected -> fenced -> advised -> reconciling -> reconciled -> patched IN ORDER", () => {
  const { stagesSeen } = runScenario();

  // every one of the seven canonical stages must be observed, in order.
  const firstIndexOf = (stage: string) => stagesSeen.indexOf(stage);
  let prev = -1;
  for (const stage of STAGES) {
    const at = firstIndexOf(stage);
    assert.ok(at >= 0, `stage "${stage}" was never observed`);
    assert.ok(
      at > prev,
      `stage "${stage}" first appeared at ${at}, not after the previous stage (${prev})`,
    );
    prev = at;
  }

  // the machine starts calm and ends patched.
  assert.equal(stagesSeen[0], "calm");
  assert.equal(stagesSeen[stagesSeen.length - 1], "patched");

  // monotonic: stage rank never regresses across the whole fold.
  let lastRank = -1;
  for (const s of stagesSeen) {
    const r = STAGES.indexOf(s);
    assert.ok(r >= lastRank, `stage regressed at "${s}"`);
    lastRank = r;
  }
});

test("drift card: ben node neutral -> red -> green; chen node neutral -> blue -> green", () => {
  const { state, benColors, chenColors } = runScenario();

  // ben passes through red (fenced) before reaching green (reconciled).
  assert.equal(benColors[0], "neutral", "ben starts neutral");
  const benRedAt = benColors.indexOf("red");
  const benGreenAt = benColors.indexOf("green");
  assert.ok(benRedAt >= 0, "ben never turned red (fenced)");
  assert.ok(benGreenAt >= 0, "ben never turned green (reconciled)");
  assert.ok(benRedAt < benGreenAt, "ben reached green before red");
  assert.equal(state.nodes.ben.color, "green");
  assert.equal(state.nodes.ben.label, "reconciled");

  // chen passes through blue (advised) before reaching green (reconciled),
  // and is NEVER red.
  assert.equal(chenColors[0], "neutral", "chen starts neutral");
  assert.ok(!chenColors.includes("red"), "chen must never turn red");
  const chenBlueAt = chenColors.indexOf("blue");
  const chenGreenAt = chenColors.indexOf("green");
  assert.ok(chenBlueAt >= 0, "chen never turned blue (advised)");
  assert.ok(chenGreenAt >= 0, "chen never turned green (reconciled)");
  assert.ok(chenBlueAt < chenGreenAt, "chen reached green before blue");
  assert.equal(state.nodes.chen.color, "green");
  assert.equal(state.nodes.chen.label, "reconciled");

  // center node stays amber throughout.
  assert.equal(state.nodes.center.color, "amber");
});

test("drift card: reconciled count reaches 2/2", () => {
  const { state } = runScenario();
  assert.equal(state.chips.reconciled.total, 2);
  assert.equal(state.chips.reconciled.count, 2);
});

test("drift card: footer exposes spec PR #14 and ledger #112", () => {
  const { state } = runScenario();
  assert.ok(state.footer, "footer must be revealed at patched");
  assert.equal(state.footer.pr_number, 14);
  assert.equal(state.footer.ledger_id, 112);
  assert.equal(state.footer.patch_path, "docs/spec.md");
  assert.match(state.footer.text, /spec PR #14/);
  assert.match(state.footer.text, /ledger #112/);
  assert.match(state.footer.text, /docs\/spec\.md/);
});

test("drift card: a per-session reconciled with workspace:true is treated as workspace-complete (disambiguation on payload, not type)", () => {
  // both events share type "reconciled"; only payload.workspace distinguishes.
  let state = initialDriftState();
  // get the card into reconciling with a single per-session reconcile.
  state = reduceDriftState(state, scenarioEvents()[0]); // detected
  state = reduceDriftState(state, scenarioEvents()[1]); // fenced
  state = reduceDriftState(state, scenarioEvents()[2]); // advised (ben)
  state = reduceDriftState(state, scenarioEvents()[3]); // advised (chen)
  state = reduceDriftState(state, scenarioEvents()[4]); // per-session ben
  assert.equal(state.stage, "reconciling", "per-session reconcile -> reconciling");
  assert.equal(state.chips.reconciled.count, 1, "per-session increments the count");

  // now the SAME type string but workspace:true must flip to reconciled, NOT
  // increment the per-session count beyond what landed.
  state = reduceDriftState(state, scenarioEvents()[6]); // workspace reconciled
  assert.equal(state.stage, "reconciled", "workspace:true -> reconciled stage");
  assert.equal(state.header, "green", "workspace reconcile eases the header green");
  // a workspace reconcile snaps the count to total (settle), never beyond.
  assert.equal(state.chips.reconciled.count, 2);
  assert.equal(state.chips.reconciled.total, 2);

  // and a repeated per-session reconciled for the same session does NOT double
  // count (correlation by session_id).
  let s2 = initialDriftState();
  for (const ev of scenarioEvents().slice(0, 5)) s2 = reduceDriftState(s2, ev);
  assert.equal(s2.chips.reconciled.count, 1);
  s2 = reduceDriftState(s2, scenarioEvents()[4]); // ben again
  assert.equal(s2.chips.reconciled.count, 1, "duplicate per-session must not double count");
});

test("drift card: reduced-motion does NOT change the final reduced state (motion-agnostic reducer)", () => {
  const motion = runScenario(false).state;
  const reduced = runScenario(true).state;

  // the reducer never reads reducedMotion, so every information-bearing field
  // of the final state must be identical regardless of the flag.
  assert.equal(reduced.stage, motion.stage);
  assert.deepEqual(reduced.epoch, motion.epoch);
  assert.equal(reduced.header, motion.header);
  assert.deepEqual(reduced.chips, motion.chips);
  assert.deepEqual(reduced.nodes, motion.nodes);
  assert.deepEqual(reduced.footer, motion.footer);

  // the ONLY difference is the carried flag itself.
  assert.equal(motion.reducedMotion, false);
  assert.equal(reduced.reducedMotion, true);

  // spot-check the headline truths read identically in reduced mode.
  assert.equal(reduced.nodes.ben.color, "green");
  assert.equal(reduced.nodes.ben.label, "reconciled");
  assert.equal(reduced.nodes.chen.color, "green");
  assert.equal(reduced.nodes.chen.label, "reconciled");
  assert.equal(reduced.chips.reconciled.count, 2);
  assert.equal(reduced.footer?.pr_number, 14);
  assert.equal(reduced.footer?.ledger_id, 112);
});

test("drift card: severity routes the advised node — 'fence' keeps red, 'advisory' goes blue", () => {
  let state = initialDriftState();
  state = reduceDriftState(state, scenarioEvents()[0]); // detected
  state = reduceDriftState(state, scenarioEvents()[1]); // fenced (ben red)
  assert.equal(state.nodes.ben.color, "red");

  // ben's advisory has severity 'fence' -> ben stays red (reads as fenced).
  state = reduceDriftState(state, scenarioEvents()[2]);
  assert.equal(state.nodes.ben.color, "red", "fence-severity advisory keeps the node red");
  assert.equal(state.nodes.ben.label, "fenced");

  // chen's advisory has severity 'advisory' -> chen neutral -> blue.
  state = reduceDriftState(state, scenarioEvents()[3]);
  assert.equal(state.nodes.chen.color, "blue", "advisory-severity flips the node blue");
  assert.equal(state.nodes.chen.label, "advised");
});
