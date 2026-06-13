// demo/emitter.ts — the scripted lifecycle emitter for the tower / video / replay.
//
// This replays the EXACT schema §3 events on a compressed (~8s) or instant
// timeline, with honest §9 elapsed-time LABELS:
//   detected 0.3s -> fenced 5.8s -> advised 6.4s -> reconciled by 14:03:40 ->
//   PR #14 14:04.
//
// IMPORTANT (not-a-dashboard, RECONCILIATION #1): the emitter is the VIDEO/REPLAY
// source only. It is NOT the sole source of `reconciled` — the live server
// (bus-registry) emits that on the real path. The headless runner asserts its
// predicates off the LIVE path, never off this emitter. The emitter exists so the
// tower can replay a deterministic, well-timed lifecycle with the app stopped.
//
// Node built-ins only. No model touches this path.

import type { Delta } from "../server/store.ts";
import type { Advisory } from "../server/arbiter/advise.ts";

// ---- the replay frame: one §3 event + its honest §9 label + offset ----

export type EmitterFrame = {
  /** schema §3 event type. */
  type:
    | "delta.detected"
    | "write.fenced"
    | "advisory.delivered"
    | "reconciled"
    | "spec.pr.opened";
  /** honest §9 elapsed-time label for the strip. */
  label: string;
  /** offset (ms) from the start of the lifecycle on the COMPRESSED timeline. */
  atMs: number;
  /** the schema §3 payload, snake_case verbatim. */
  payload: Record<string, unknown>;
};

export type EmitterScript = {
  /** total compressed runtime in ms (≈8s). */
  durationMs: number;
  frames: EmitterFrame[];
};

// The honest §9 wall-clock anchors (the demo's recorded timeline).
const TS = {
  detected: "2026-06-13T14:02:11Z",
  fenced: "2026-06-13T14:02:17Z",
  advised: "2026-06-13T14:02:17.4Z",
  reconciledBen: "2026-06-13T14:03:20Z",
  reconciledChen: "2026-06-13T14:03:40Z",
  reconciledWorkspace: "2026-06-13T14:03:40Z",
  prOpened: "2026-06-13T14:04:00Z",
} as const;

export type BuildScriptInput = {
  delta: Delta;
  advisories: Advisory[]; // exactly two (ben fence, chen advisory)
  pr: { pr_number: number; url: string; ledger_id: number; patch_path: string };
  /** Compress to this total runtime (default ~8s); pass 0 for an instant script. */
  durationMs?: number;
};

/**
 * buildEmitterScript — assemble the ordered, time-labeled replay frames from the
 * REAL delta/advisories/PR produced by the live run. Timings map the honest §9
 * milestones onto a compressed (~8s) timeline so the tower replay is watchable.
 */
export function buildEmitterScript(input: BuildScriptInput): EmitterScript {
  const durationMs = input.durationMs ?? 8000;
  const d = input.delta;

  // honest milestone fractions of the lifecycle (0.3s detected ... 14:04 PR).
  // We anchor the compressed timeline on the real §9 cadence:
  //   detected 0.3s, fenced 5.8s, advised 6.4s, reconciled ~14:03:40, PR 14:04.
  const scale = durationMs / 8000; // 8s reference

  const benAdvisory = input.advisories.find((a) => a.recipient === "ben") ?? input.advisories[0];
  const chenAdvisory = input.advisories.find((a) => a.recipient === "chen") ?? input.advisories[1];

  const frames: EmitterFrame[] = [
    {
      type: "delta.detected",
      label: "detected 0.3s",
      atMs: Math.round(300 * scale),
      payload: {
        epoch: d.epoch,
        contract_id: d.contract_id,
        from_version: d.from_version,
        to_version: d.to_version,
        author: d.author,
        ts: TS.detected,
        why: d.why,
        mechanical_change: d.mechanical_change,
      },
    },
    {
      type: "write.fenced",
      label: "fenced 5.8s",
      atMs: Math.round(5800 * scale),
      payload: {
        session_id: benAdvisory?.session_id ?? "sess-ben",
        human: "ben",
        path: "routes/users.ts",
        delta_epoch: d.epoch,
        contract_id: d.contract_id,
        reason: `${d.contract_id}.email was renamed to contact_email (migration 0042, ${d.author}). This Edit references .email and will break. Re-sync to v${d.epoch} and use contact_email.`,
        ts: TS.fenced,
      },
    },
    {
      type: "advisory.delivered",
      label: "advised 6.4s",
      atMs: Math.round(6400 * scale),
      payload: benAdvisory
        ? {
            session_id: benAdvisory.session_id,
            human: benAdvisory.recipient,
            recipient: benAdvisory.recipient,
            file: benAdvisory.file,
            advisory: benAdvisory,
            ts: TS.advised,
          }
        : {},
    },
    {
      type: "advisory.delivered",
      label: "advised 6.4s",
      atMs: Math.round(6400 * scale),
      payload: chenAdvisory
        ? {
            session_id: chenAdvisory.session_id,
            human: chenAdvisory.recipient,
            recipient: chenAdvisory.recipient,
            file: chenAdvisory.file,
            advisory: chenAdvisory,
            ts: TS.advised,
          }
        : {},
    },
    {
      type: "reconciled",
      label: "reconciled by 14:03:40",
      atMs: Math.round(7000 * scale),
      payload: {
        session_id: benAdvisory?.session_id ?? "sess-ben",
        human: "ben",
        contract_id: d.contract_id,
        epoch: d.epoch,
        path: "routes/users.ts",
        ts: TS.reconciledBen,
      },
    },
    {
      type: "reconciled",
      label: "reconciled by 14:03:40",
      atMs: Math.round(7400 * scale),
      payload: {
        session_id: chenAdvisory?.session_id ?? "sess-chen",
        human: "chen",
        contract_id: d.contract_id,
        epoch: d.epoch,
        path: "UserCard.tsx",
        ts: TS.reconciledChen,
      },
    },
    {
      type: "reconciled",
      label: "reconciled by 14:03:40",
      atMs: Math.round(7600 * scale),
      payload: {
        workspace: true,
        epoch: d.epoch,
        sessions: [benAdvisory?.session_id ?? "sess-ben", chenAdvisory?.session_id ?? "sess-chen"],
        ts: TS.reconciledWorkspace,
      },
    },
    {
      type: "spec.pr.opened",
      label: "PR #14 14:04",
      atMs: Math.round(8000 * scale),
      payload: {
        pr_number: input.pr.pr_number,
        url: input.pr.url,
        contract_id: d.contract_id,
        epoch: d.epoch,
        ledger_id: input.pr.ledger_id,
        patch_path: input.pr.patch_path,
        ts: TS.prOpened,
      },
    },
  ];

  return { durationMs, frames };
}

/**
 * replayScript — fire each frame's payload to a sink in order. With timed=true
 * it spaces frames out on the compressed timeline (for the tower/video);
 * timed=false (default) fires them instantly (for tests/headless replay).
 *
 * The sink receives (type, payload, label). Returns the frames fired in order.
 */
export async function replayScript(
  script: EmitterScript,
  sink: (type: EmitterFrame["type"], payload: Record<string, unknown>, label: string) => void,
  opts: { timed?: boolean } = {},
): Promise<EmitterFrame[]> {
  const fired: EmitterFrame[] = [];
  let last = 0;
  for (const frame of script.frames) {
    if (opts.timed) {
      const wait = Math.max(0, frame.atMs - last);
      if (wait > 0) await sleep(wait);
      last = frame.atMs;
    }
    sink(frame.type, frame.payload, frame.label);
    fired.push(frame);
  }
  return fired;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
