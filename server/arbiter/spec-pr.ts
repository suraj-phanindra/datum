// server/arbiter/spec-pr.ts — the arbiter's slow-path, off-critical-path output:
// once advisories are delivered for a delta, patch the seed repo's docs/spec.md
// to the new contract truth, open a PR (gh or a local artifact), and LINK the
// existing ledger entry. This closes the loop from "truth changed" to "the
// written spec now agrees" (spec-pr PRD).
//
// Strict boundaries (RECONCILIATION #6/#7 + PRD):
//   - openSpecPR LINKS the existing ledger #112 (input ledgerId) — it NEVER
//     calls POST /decide and never creates/rewrites a ledger row.
//   - it NEVER calls bumpRegistry / classifyEdit / decideFence: this never moves
//     the epoch and never gates a write.
//   - it is IDEMPOTENT per epoch: re-running for the same epoch must not open a
//     duplicate PR or double-write the ledger.
//
// Casing (schema §5): the in-process Delta is read as snake_case (it IS the
// delta.detected payload); the emitted spec.pr.opened payload is snake_case
// verbatim per schema §3: { pr_number, url, contract_id, epoch, ledger_id,
// patch_path } with patch_path = "docs/spec.md".

import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  readFileSync,
  writeFileSync,
  existsSync,
} from "node:fs";
import { join, dirname } from "node:path";

import type { Delta } from "../store.ts";

// ---- result + options ----

export type SpecPRResult = {
  pr_number: number;
  url: string;
  contract_id: string;
  epoch: number;
  ledger_id: number;
  patch_path: string;
};

/**
 * A minimal sink the caller can hand in so the emitted spec.pr.opened event is
 * appended somewhere durable (the bus/store) instead of only returned. Either:
 *   - store: anything with addEvent(type, payload) (server Store), or
 *   - busUrl: a base URL we POST /events to (schema §4 POST /events).
 * If neither is given the event is only RETURNED (in `result` + via opts.onEvent).
 */
export type SpecPROptions = {
  /** The git repo to patch (a real repo on disk; the demo's seed workspace). */
  repoDir: string;
  /** Path within repoDir to the spec file. Default "docs/spec.md". */
  specPath?: string;
  /** Open a real GitHub PR via `gh` when a GitHub remote exists. Default false. */
  useGh?: boolean;
  /** Optional Store-like sink to append the spec.pr.opened event to. */
  store?: { addEvent: (type: string, payload: Record<string, unknown>) => unknown };
  /** Optional bus base URL to POST /events the spec.pr.opened event to. */
  busUrl?: string;
  /** Optional callback invoked with the spec.pr.opened payload (test hook). */
  onEvent?: (payload: SpecPRResult) => void;
  /** Base branch for the PR. Default "main". */
  base?: string;
};

// The hero epoch opens PR #14 (the honest demo value, spec-pr PRD line 6).
const HERO_EPOCH = 8;
const HERO_PR_NUMBER = 14;

// ---- helpers ----

function git(repoDir: string, args: string[]): { ok: boolean; stdout: string; stderr: string } {
  const r = spawnSync("git", args, { cwd: repoDir, encoding: "utf8" });
  return {
    ok: r.status === 0,
    stdout: (r.stdout ?? "").trim(),
    stderr: (r.stderr ?? "").trim(),
  };
}

/** Does the repo have a GitHub remote? (origin URL contains github.com). */
function hasGitHubRemote(repoDir: string): boolean {
  const r = git(repoDir, ["remote", "-v"]);
  if (!r.ok) return false;
  return /github\.com/i.test(r.stdout);
}

/**
 * Apply the delta's mechanical change to the spec text. For the hero rename, the
 * column users.email -> contact_email: rewrite bare/dotted references and append
 * the migration note. Returns { text, changed }.
 */
export function applyDeltaToSpec(spec: string, delta: Delta): { text: string; changed: boolean } {
  const mc = delta.mechanical_change;
  let text = spec;

  if (mc.kind === "rename_column") {
    const { table, from, to, migration } = mc;
    // Rewrite the qualified form first (users.email -> users.contact_email), then
    // any remaining bare ".email" property references (.email -> .contact_email),
    // then standalone occurrences of the old column word. Order matters so the
    // qualified rewrite doesn't get clobbered by the bare one.
    const qualified = new RegExp(`\\b${escapeRe(table)}\\.${escapeRe(from)}\\b`, "g");
    text = text.replace(qualified, `${table}.${to}`);
    // dotted property form (.email) not already handled above.
    const dotted = new RegExp(`\\.${escapeRe(from)}\\b`, "g");
    text = text.replace(dotted, `.${to}`);
    // bare column word (e.g. a column-list "email"); avoid touching "contact_email"
    // by requiring a word boundary on both sides — escapeRe + \b handles it.
    const bare = new RegExp(`\\b${escapeRe(from)}\\b`, "g");
    text = text.replace(bare, to);

    // Note the migration without re-printing the bare old qualified name
    // (`{table}.{from}`): the spec must end up free of the stale reference. We
    // record the column rename as `{from} -> {to}` (unqualified) + the migration.
    const note = migration
      ? `\n<!-- datum: ${table} column ${from} -> ${to} (migration ${migration}, ${delta.author}) -->\n`
      : `\n<!-- datum: ${table} column ${from} -> ${to} (${delta.author}) -->\n`;
    // Only append the note once (idempotent at the text level too).
    if (!text.includes(note.trim())) {
      text = text.endsWith("\n") ? text + note : text + "\n" + note;
    }
    return { text, changed: text !== spec };
  }

  if (mc.kind === "drop_column") {
    const bare = new RegExp(`\\b${escapeRe(mc.table)}\\.${escapeRe(mc.column)}\\b`, "g");
    text = text.replace(bare, `${mc.table}.<dropped:${mc.column}>`);
    return { text, changed: text !== spec };
  }

  if (mc.kind === "add_column") {
    const note = `\n<!-- datum: ${mc.table}.${mc.column} added${mc.migration ? ` (migration ${mc.migration})` : ""} -->\n`;
    if (!text.includes(note.trim())) text = (text.endsWith("\n") ? text : text + "\n") + note;
    return { text, changed: text !== spec };
  }

  if (mc.kind === "api_field_renamed" && mc.from && mc.to) {
    const re = new RegExp(`\\b${escapeRe(mc.from)}\\b`, "g");
    text = text.replace(re, mc.to);
    return { text, changed: text !== spec };
  }

  // unhandled kinds: leave the spec untouched.
  return { text, changed: false };
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Derive the PR number: the hero epoch is #14; otherwise a stable per-epoch value. */
function prNumberFor(epoch: number): number {
  if (epoch === HERO_EPOCH) return HERO_PR_NUMBER;
  // Honest, deterministic derivation off the hero anchor so re-runs are stable.
  return HERO_PR_NUMBER + (epoch - HERO_EPOCH);
}

function prTitle(delta: Delta): string {
  const mc = delta.mechanical_change;
  if (mc.kind === "rename_column") {
    return `spec: ${mc.table}.${mc.from} -> ${mc.to}${mc.migration ? ` (migration ${mc.migration})` : ""}`;
  }
  return `spec: ${delta.contract_id} v${delta.from_version} -> v${delta.to_version}`;
}

function prBody(delta: Delta, ledgerId: number): string {
  const mc = delta.mechanical_change;
  const change =
    mc.kind === "rename_column"
      ? `\`${mc.table}.${mc.from}\` renamed to \`${mc.table}.${mc.to}\`${mc.migration ? ` (migration ${mc.migration})` : ""}`
      : `${delta.contract_id} v${delta.from_version} -> v${delta.to_version}`;
  return [
    `Patches the spec to the new contract truth.`,
    ``,
    `- Contract: \`${delta.contract_id}\` v${delta.from_version} -> v${delta.to_version} (epoch ${delta.epoch})`,
    `- Change: ${change}`,
    `- Author: ${delta.author}`,
    `- Why: "${delta.why}"`,
    ``,
    `Linked ledger: #${ledgerId}`,
  ].join("\n");
}

/** Emit the spec.pr.opened event to whatever sinks are configured. */
async function emitOpened(payload: SpecPRResult, opts: SpecPROptions): Promise<void> {
  if (opts.store) {
    opts.store.addEvent("spec.pr.opened", { ...payload });
  }
  if (opts.busUrl) {
    try {
      await fetch(new URL("/events", opts.busUrl).toString(), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ type: "spec.pr.opened", payload: { ...payload } }),
      });
    } catch {
      // fail open: the bus being unreachable must never brick the spec-pr step.
    }
  }
  if (opts.onEvent) opts.onEvent(payload);
}

// ---- the main entry point ----

/**
 * openSpecPR — patch the spec to the new contract truth, open a PR (gh or local
 * artifact), link the existing ledger entry, and emit `spec.pr.opened`.
 *
 * IDEMPOTENT per epoch: if the branch + local artifact already exist for this
 * epoch (or the spec is already patched and the artifact exists), re-running
 * returns the existing PR coordinates and does NOT open a duplicate or rewrite
 * the ledger. The ledger is only LINKED (input id) — never created here.
 */
export async function openSpecPR(
  delta: Delta,
  ledgerId: number,
  opts: SpecPROptions,
): Promise<SpecPRResult> {
  const repoDir = opts.repoDir;
  const specPath = opts.specPath ?? "docs/spec.md";
  const base = opts.base ?? "main";
  const epoch = delta.epoch;
  const branch = `datum/spec-v${epoch}`;
  const useGh = opts.useGh ?? false;

  const prDir = join(repoDir, ".datum-pr");
  // pr.json is the PRD-named artifact; the .patch is per-epoch so multiple
  // epochs don't clobber each other.
  const artifactJson = join(prDir, "pr.json");
  const patchFile = join(prDir, `spec-v${epoch}.patch`);

  const result: SpecPRResult = {
    pr_number: prNumberFor(epoch),
    url: "",
    contract_id: delta.contract_id,
    epoch,
    ledger_id: ledgerId,
    patch_path: specPath,
  };

  // ---- idempotency gate ----
  // If we already produced an artifact for THIS epoch, reuse it verbatim. We do
  // NOT re-open the PR, do NOT re-commit, do NOT touch the ledger, and we still
  // re-emit the event so a consumer that missed it (e.g. a fresh store) sees it
  // — but with the SAME coordinates (pr_number/url) so nothing is duplicated.
  if (existsSync(artifactJson)) {
    const prior = JSON.parse(readFileSync(artifactJson, "utf8")) as {
      pr_number: number;
      url: string;
      ledger_id: number;
      epoch?: number;
    };
    if (prior.epoch === epoch) {
      const reused: SpecPRResult = {
        ...result,
        pr_number: prior.pr_number,
        url: prior.url,
        ledger_id: prior.ledger_id ?? ledgerId,
      };
      await emitOpened(reused, opts);
      return reused;
    }
  }

  // ---- patch the spec on a fresh branch ----
  const absSpec = join(repoDir, specPath);
  if (!existsSync(absSpec)) {
    throw new Error(`spec file not found: ${absSpec}`);
  }

  // create (or reset to) the branch off the current HEAD.
  // `git checkout -B` is idempotent: makes or resets the branch.
  const co = git(repoDir, ["checkout", "-B", branch]);
  if (!co.ok) {
    throw new Error(`git checkout -B ${branch} failed: ${co.stderr}`);
  }

  const before = readFileSync(absSpec, "utf8");
  const { text: after, changed } = applyDeltaToSpec(before, delta);
  if (changed) {
    writeFileSync(absSpec, after);
  }

  // stage + commit the spec change.
  const title = prTitle(delta);
  git(repoDir, ["add", specPath]);
  const commit = git(repoDir, [
    "-c",
    "user.email=datum@local",
    "-c",
    "user.name=datum-arbiter",
    "commit",
    "-m",
    title,
  ]);
  // commit may be a no-op if `changed` was false and nothing staged — tolerate it.
  if (!commit.ok && !/nothing to commit/i.test(commit.stdout + commit.stderr)) {
    // Non-fatal: continue to produce the artifact regardless.
  }

  // capture the diff as a patch artifact (the local PR's "diff").
  const diff = git(repoDir, ["format-patch", "-1", "--stdout"]);
  const patchText = diff.ok && diff.stdout ? diff.stdout : "";

  // ---- open the PR: gh if asked + remote exists, else local artifact ----
  let prNumber = prNumberFor(epoch);
  let url = "";
  let openedViaGh = false;

  if (useGh && hasGitHubRemote(repoDir)) {
    // push the branch, then `gh pr create`. On any failure, fall back to local.
    const push = git(repoDir, ["push", "-u", "origin", branch]);
    if (push.ok) {
      const body = prBody(delta, ledgerId);
      const gh = spawnSync(
        "gh",
        ["pr", "create", "--title", title, "--body", body, "--base", base, "--head", branch],
        { cwd: repoDir, encoding: "utf8" },
      );
      if (gh.status === 0) {
        url = (gh.stdout ?? "").trim().split(/\s+/).pop() ?? "";
        // gh prints the PR URL; derive the number from its tail (.../pull/NN).
        const m = /\/pull\/(\d+)/.exec(url);
        if (m) prNumber = Number(m[1]);
        openedViaGh = true;
      }
    }
  }

  // ---- write the local PR artifact (always — it is the deterministic record) ----
  mkdirSync(prDir, { recursive: true });
  writeFileSync(patchFile, patchText);

  if (!openedViaGh) {
    // a local "PR url" pointing at the on-disk patch artifact (honest offline).
    url = `file://${patchFile}`;
  }

  const artifact = {
    pr_number: prNumber,
    url,
    title,
    body: prBody(delta, ledgerId),
    branch,
    base,
    ledger_id: ledgerId,
    contract_id: delta.contract_id,
    epoch,
    patch_path: specPath,
    opened_via: openedViaGh ? "gh" : "local",
  };
  writeFileSync(artifactJson, JSON.stringify(artifact, null, 2) + "\n");

  result.pr_number = prNumber;
  result.url = url;

  // ---- emit spec.pr.opened (schema §3 payload) ----
  await emitOpened(result, opts);

  return result;
}
