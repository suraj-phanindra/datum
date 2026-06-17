// cloud/src/arbiter-consumer.ts — Datum Cloud's arbiter, the Queue consumer.
//
// The DO puts { workspace_id, delta } on env.ARBITER_QUEUE after a delta.detected
// (the only critical-path write; the model never runs on it). This consumer is
// the slow, off-critical-path half: for each queued delta it
//   1. fetches the live sessions roster from the workspace DO,
//   2. computes the deterministic recipient set (intersect; author excluded),
//   3. for each recipient calls advise(delta, session, modelClient) where the
//      modelClient is a WORKERS-COMPATIBLE Anthropic client (fetch only, no CLI
//      fallback — child_process does not exist in Workers),
//   4. POSTs one advisory.delivered event per recipient back into the DO,
//   5. opens the spec PR via the GitHub App against the repo derived from the
//      workspace_id (host/owner/repo) and links the workspace ledger entry.
// m.ack() on success; m.retry({ delaySeconds: 30 }) on any error.
//
// This mirrors server/arbiter/index.ts (runArbiter) but over the DO transport +
// the GitHub App PR client, and with a fetch-only model client (the OSS
// defaultModelClient's CLI fallback is unavailable in Workers).

import type { Env } from "./env.ts";
import { intersect } from "../../server/arbiter/intersect.ts";
import { advise } from "../../server/arbiter/advise.ts";
import type { Advisory, ModelClient } from "../../server/arbiter/advise.ts";
import type { Delta, Session, LedgerEntry } from "../../server/store.ts";
import { openSpecPR, installationToken } from "./github-app.ts";

// The queue message body the DO producer sends.
type ArbiterMessage = {
  workspace_id: string;
  delta: Delta;
};

const MODEL = "claude-opus-4-8";
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";

// ---- Workers-compatible model client (fetch only, NO CLI fallback) ----

/**
 * Build a ModelClient that calls claude-opus-4-8 via the Anthropic Messages API
 * over fetch with env.ANTHROPIC_API_KEY. Uses the existing buildPrompt-shaped
 * PromptPayload (cached shared prefix + per-recipient tail). There is no
 * child_process fallback — that does not exist in Workers; a failure throws so
 * the message retries.
 */
function makeModelClient(env: Env): ModelClient {
  return async (prompt) => {
    const res = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1024,
        // low effort: pin the judgment-layer output stable + cheap.
        output_config: { effort: "low" },
        system: prompt.system,
        messages: prompt.messages,
      }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`Anthropic API ${res.status} ${detail}`);
    }
    const data = (await res.json()) as {
      content?: Array<{ type: string; text?: string }>;
    };
    const text = (data.content ?? [])
      .filter((b) => b.type === "text" && typeof b.text === "string")
      .map((b) => b.text as string)
      .join("\n")
      .trim();
    if (!text) throw new Error("empty Anthropic response");
    return text;
  };
}

// ---- DO transport helpers ----

/** Fetch the live sessions roster from the workspace DO (GET /sessions). */
async function fetchSessions(stub: { fetch: (req: Request) => Promise<Response> }): Promise<Session[]> {
  const res = await stub.fetch(new Request("https://do/sessions", { method: "GET" }));
  if (!res.ok) throw new Error(`DO GET /sessions failed: ${res.status}`);
  const data = (await res.json()) as { sessions?: Session[] };
  return data.sessions ?? [];
}

/** POST an event back into the workspace DO (POST /events, body { type, payload }). */
async function postEvent(
  stub: { fetch: (req: Request) => Promise<Response> },
  type: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const res = await stub.fetch(
    new Request("https://do/events", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type, payload }),
    }),
  );
  if (!res.ok) throw new Error(`DO POST /events (${type}) failed: ${res.status}`);
}

/**
 * The workspace ledger entry to link from the spec PR. We link the existing
 * ledger row for this delta's contract (the arbiter LINKS, never creates, a
 * ledger entry — schema/spec-pr boundary). Picks the most recent ledger entry
 * tagged with the delta's contract_id, else the newest entry, else 0.
 */
async function resolveLedgerId(
  stub: { fetch: (req: Request) => Promise<Response> },
  delta: Delta,
): Promise<number> {
  try {
    const res = await stub.fetch(new Request("https://do/ledger", { method: "GET" }));
    if (!res.ok) return 0;
    const data = (await res.json()) as { ledger?: LedgerEntry[] };
    const ledger = data.ledger ?? [];
    const tagged = ledger.find((e) => e.contract_id === delta.contract_id);
    return (tagged ?? ledger[0])?.id ?? 0;
  } catch {
    return 0;
  }
}

// ---- spec PR content (Workers-native; mirrors server/arbiter/spec-pr.ts) ----

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Apply the delta's mechanical change to the spec text (the OSS transform, node-free). */
function applyDeltaToSpec(spec: string, delta: Delta): string {
  const mc = delta.mechanical_change;
  let text = spec;
  if (mc.kind === "rename_column") {
    const { table, from, to, migration } = mc;
    text = text.replace(new RegExp(`\\b${escapeRe(table)}\\.${escapeRe(from)}\\b`, "g"), `${table}.${to}`);
    text = text.replace(new RegExp(`\\.${escapeRe(from)}\\b`, "g"), `.${to}`);
    text = text.replace(new RegExp(`\\b${escapeRe(from)}\\b`, "g"), to);
    const note = migration
      ? `\n<!-- datum: ${table} column ${from} -> ${to} (migration ${migration}, ${delta.author}) -->\n`
      : `\n<!-- datum: ${table} column ${from} -> ${to} (${delta.author}) -->\n`;
    if (!text.includes(note.trim())) text = (text.endsWith("\n") ? text : text + "\n") + note;
    return text;
  }
  if (mc.kind === "api_field_renamed" && mc.from && mc.to) {
    return text.replace(new RegExp(`\\b${escapeRe(mc.from)}\\b`, "g"), mc.to);
  }
  // For other kinds, append a contract-truth note rather than rewriting blindly.
  const note = `\n<!-- datum: ${delta.contract_id} v${delta.from_version} -> v${delta.to_version} (${delta.author}) -->\n`;
  if (!text.includes(note.trim())) text = (text.endsWith("\n") ? text : text + "\n") + note;
  return text;
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

/** Parse a workspace_id (host/owner/repo) into { owner, repo }. */
function repoFromWorkspaceId(workspaceId: string): { owner: string; repo: string } {
  const parts = workspaceId.split("/").filter(Boolean);
  // host/owner/repo -> take the last two segments as owner/repo.
  const repo = parts[parts.length - 1] ?? "";
  const owner = parts[parts.length - 2] ?? "";
  if (!owner || !repo) throw new Error(`cannot derive owner/repo from workspace_id "${workspaceId}"`);
  return { owner, repo };
}

const SPEC_PATH = "docs/spec.md";

/**
 * Open the spec PR for a delta via the GitHub App. Fetches the current spec from
 * the repo (via the GitHub API), applies the delta transform, and opens a PR on
 * a per-epoch branch. Failures here throw so the message retries (the advisories
 * are already delivered to the DO at that point; the PR step is the slow tail).
 */
async function openSpecPRForDelta(
  workspaceId: string,
  delta: Delta,
  ledgerId: number,
  env: Env,
): Promise<{ pr_number: number; url: string }> {
  const { owner, repo } = repoFromWorkspaceId(workspaceId);
  const base = "main";
  const branch = `datum/spec-v${delta.epoch}`;
  const token = await installationToken(env);

  // Read the current spec from the base branch; apply the delta transform.
  const getRes = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/contents/${SPEC_PATH}?ref=${base}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github.raw+json",
        "User-Agent": "datum-cloud-arbiter",
      },
    },
  );
  const before = getRes.ok ? await getRes.text() : `# spec\n\n${delta.contract_id}\n`;
  const after = applyDeltaToSpec(before, delta);

  return openSpecPR(
    {
      owner,
      repo,
      base,
      branch,
      path: SPEC_PATH,
      content: after,
      title: prTitle(delta),
      body: prBody(delta, ledgerId),
    },
    token,
  );
}

// ---- the Queue consumer ----

/**
 * handleQueue — process a batch of arbiter messages. Each message is one
 * { workspace_id, delta }. Per message: roster -> recipients -> advise ->
 * advisory.delivered events -> spec PR + ledger link. ack on success, retry with
 * a 30s backoff on error (the dead-letter queue catches exhausted retries).
 */
export async function handleQueue(
  batch: MessageBatch,
  env: Env,
  _ctx: ExecutionContext,
): Promise<void> {
  const modelClient = makeModelClient(env);

  for (const message of batch.messages) {
    try {
      const { workspace_id, delta } = message.body as ArbiterMessage;
      const stub = env.WORKSPACE_BUS.getByName(workspace_id);

      // 1) live roster + deterministic recipient set (author excluded).
      const sessions = await fetchSessions(stub);
      const recipients = intersect(delta, sessions);

      // 2) one tailored advisory per recipient (the model writes prose; the
      // shared prefix from buildPrompt caches across recipients).
      const advisories: Advisory[] = await Promise.all(
        recipients.map((session) => advise(delta, session, modelClient)),
      );

      // 3) POST one advisory.delivered event per recipient back into the DO
      // (schema §3 payload: { session_id, human, recipient, file, advisory }).
      for (const advisory of advisories) {
        await postEvent(stub, "advisory.delivered", {
          session_id: advisory.session_id,
          human: advisory.recipient,
          recipient: advisory.recipient,
          file: advisory.file,
          advisory,
        });
      }

      // 4) open the spec PR via the GitHub App + link the ledger entry, then
      // emit spec.pr.opened into the DO (schema §3 payload).
      const ledgerId = await resolveLedgerId(stub, delta);
      const pr = await openSpecPRForDelta(workspace_id, delta, ledgerId, env);
      await postEvent(stub, "spec.pr.opened", {
        pr_number: pr.pr_number,
        url: pr.url,
        contract_id: delta.contract_id,
        epoch: delta.epoch,
        ledger_id: ledgerId,
        patch_path: SPEC_PATH,
      });

      message.ack();
    } catch (_err) {
      // Off the critical path: a failure never bricks a write. Retry with
      // backoff; exhausted retries fall to the dead-letter queue.
      message.retry({ delaySeconds: 30 });
    }
  }
}
