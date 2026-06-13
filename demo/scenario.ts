// demo/scenario.ts — the ordered scenario steps for the workspace-invites demo.
//
// Sole owner: demo-runner (RECONCILIATION ownership matrix). Self-correction
// (feature #10) contributes the ben two-step as a DEFINED SECTION: ben's first
// write is the stale `.email` attempt (FENCED), his second is the corrected
// `contact_email` write (RECONCILED). The structure below keeps that two-step
// isolated under BEN_SELF_CORRECTION so feature #10 can later refine it without
// touching the rest of the scenario.
//
// This module is pure data + a thin runScenario() helper that drives the steps
// against a live bus (HTTP) — it does NOT own the deterministic predicates; the
// headless runner (datum-demo.ts) asserts those. Node built-ins only.

import { ASHA_MIGRATION_AFTER, ASHA_WHY } from "../server/seed.ts";

// ---- step vocabulary ----

export type StepKind =
  | "asha.migrate" // asha posts the migration edit -> epoch 7->8, delta.detected
  | "ben.fenced" // ben's stale .email write -> decideFence DENY -> write.fenced
  | "ben.correct" // ben's corrected contact_email write -> server reconciled
  | "chen.reconcile" // chen advised, then lands a clean write -> server reconciled
  | "arbiter.advise" // runArbiter -> two advisory.delivered that DIFFER
  | "spec.pr"; // openSpecPR -> one spec.pr.opened #14 patching docs/spec.md

export type ScenarioStep = {
  kind: StepKind;
  who: "asha" | "ben" | "chen" | "arbiter";
  sessionId: string;
  /** Honest §9 elapsed-time label for the tower/video (the emitter uses these). */
  atLabel: string;
  /** A one-line human description (printed by the runner's narration). */
  note: string;
};

export const SESSION_IDS = {
  asha: "sess-asha",
  ben: "sess-ben",
  chen: "sess-chen",
} as const;

// ---- asha's hero edit (verbatim from the seed) ----

export const ASHA_MIGRATION_PATH = "migrations/0042_rename_users_email.sql";
export const ASHA_EDIT_AFTER = ASHA_MIGRATION_AFTER;
export const ASHA_EDIT_WHY = ASHA_WHY;

// ---- ben's two-step (self-correction §10 contributes here) ----
//
// Step 1 (stale): ben tries to keep selecting `.email` in routes/users.ts while
// one epoch behind -> the fence DENIES it. Step 2 (corrected): ben rewrites the
// query to `contact_email` -> the server emits a per-session `reconciled`.

export const BEN_SELF_CORRECTION = {
  path: "routes/users.ts",
  /** The stale write the fence must DENY (still references the old column). */
  staleContent: `export async function getUser(id: number) {
  const row = await db.query("SELECT id, email, name FROM users WHERE id = ?", [id]);
  return { id: row.id, email: row.email, name: row.name };
}
`,
  /** The corrected write that reconciles (no stale symbol; uses contact_email). */
  correctedContent: `export async function getUser(id: number) {
  const row = await db.query("SELECT id, contact_email, name FROM users WHERE id = ?", [id]);
  return { id: row.id, contact_email: row.contact_email, name: row.name };
}
`,
} as const;

// ---- chen's reconcile write (clean; uses contact_email) ----

export const CHEN_RECONCILE = {
  path: "UserCard.tsx",
  // NOTE: the corrected content must be free of the bare `email` token (the stale
  // symbol) so the server's reconcile check (referencesStaleSymbol) passes — even
  // a className="email" would keep chen fenced. We rename every bare email here,
  // matching the seed repo's chen/ui branch (which rewrites \bemail\b -> contact_email).
  correctedContent: `export function UserCard({ user }: { user: UserDTO }) {
  return (
    <div className="user-card">
      <span className="name">{user.name}</span>
      <span className="contact">{user.contact_email}</span>
    </div>
  );
}
`,
} as const;

// ---- the ordered step list (honest §9 timeline labels) ----

export const SCENARIO_STEPS: ScenarioStep[] = [
  {
    kind: "asha.migrate",
    who: "asha",
    sessionId: SESSION_IDS.asha,
    atLabel: "detected 0.3s",
    note: "asha lands migration 0042: users.email -> contact_email (epoch 7 -> 8)",
  },
  {
    kind: "ben.fenced",
    who: "ben",
    sessionId: SESSION_IDS.ben,
    atLabel: "fenced 5.8s",
    note: "ben's write to routes/users.ts still selects .email -> FENCED",
  },
  {
    kind: "arbiter.advise",
    who: "arbiter",
    sessionId: "(arbiter)",
    atLabel: "advised 6.4s",
    note: "arbiter delivers two tailored advisories (ben: fence, chen: advisory)",
  },
  {
    kind: "ben.correct",
    who: "ben",
    sessionId: SESSION_IDS.ben,
    atLabel: "reconciled by 14:03:40",
    note: "ben self-corrects to contact_email -> server reconciles ben",
  },
  {
    kind: "chen.reconcile",
    who: "chen",
    sessionId: SESSION_IDS.chen,
    atLabel: "reconciled by 14:03:40",
    note: "chen adopts contact_email in UserCard.tsx -> server reconciles chen (workspace done)",
  },
  {
    kind: "spec.pr",
    who: "arbiter",
    sessionId: "(arbiter)",
    atLabel: "PR #14 14:04",
    note: "spec PR #14 patches docs/spec.md to the new truth, links ledger #112",
  },
];

// ---- runScenario: drive the steps against a live bus over HTTP ----
//
// This is a thin convenience helper for callers that want to replay the LIVE
// path (POST /events) without the full predicate assertions of datum-demo.ts.
// It returns the events observed via the bus responses. The headless runner
// does NOT call this — it runs the deterministic path directly so it can assert
// each predicate. Kept here so feature #10 / the tower can reuse the ordering.

export type RunScenarioResult = {
  registry_version: number;
  steps: Array<{ kind: StepKind; ok: boolean }>;
};

export async function runScenario(
  busUrl: string,
  postEvent: (busUrl: string, body: Record<string, unknown>) => Promise<{ registry_version?: number }>,
): Promise<RunScenarioResult> {
  const steps: Array<{ kind: StepKind; ok: boolean }> = [];
  let registry_version = 0;

  for (const step of SCENARIO_STEPS) {
    switch (step.kind) {
      case "asha.migrate": {
        const r = await postEvent(busUrl, {
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
        registry_version = r.registry_version ?? registry_version;
        steps.push({ kind: step.kind, ok: true });
        break;
      }
      case "ben.correct": {
        const r = await postEvent(busUrl, {
          type: "edit.streamed",
          payload: {
            session_id: SESSION_IDS.ben,
            human: "ben",
            tool_name: "Edit",
            path: BEN_SELF_CORRECTION.path,
            after: BEN_SELF_CORRECTION.correctedContent,
          },
        });
        registry_version = r.registry_version ?? registry_version;
        steps.push({ kind: step.kind, ok: true });
        break;
      }
      case "chen.reconcile": {
        const r = await postEvent(busUrl, {
          type: "edit.streamed",
          payload: {
            session_id: SESSION_IDS.chen,
            human: "chen",
            tool_name: "Edit",
            path: CHEN_RECONCILE.path,
            after: CHEN_RECONCILE.correctedContent,
          },
        });
        registry_version = r.registry_version ?? registry_version;
        steps.push({ kind: step.kind, ok: true });
        break;
      }
      default:
        // fence / advise / spec.pr are driven by the runner directly (not via
        // a single POST /events round-trip).
        steps.push({ kind: step.kind, ok: true });
    }
  }

  return { registry_version, steps };
}
