// server/arbiter/advise.ts — turn one (delta, recipient session) pair into an
// Advisory (schema §6) via Claude Opus 4.8.
//
// The model writes the BODY (tailored prose) + ACTIONS (concrete steps). The
// structural fields (recipient, session_id, file, delta_ref, severity) are
// assembled deterministically from the delta + the recipient's manifest — the
// model never decides severity or which file is at risk, so those stay honest
// and the demo's two seeded advisories differ only in prose, not in shape.
//
// modelClient is INJECTABLE (tests pass a fake, offline canned client). The
// default client calls claude-opus-4-8 via the Anthropic Messages API over
// fetch, with a CLI fallback that shells out to `claude -p`.

import { spawn } from "node:child_process";
import type { Delta, Session } from "../store.ts";
import { buildPrompt, deltaMigration } from "./prompt.ts";
import type { PromptPayload } from "./prompt.ts";

// ---- Advisory shape (schema §6, snake_case wire) ----

export type Severity = "fence" | "advisory";

export type DeltaRef = {
  contract_id: string;
  from_version: number;
  to_version: number;
  migration?: string;
  author: string;
};

export type Advisory = {
  recipient: string;
  session_id: string;
  file: string;
  delta_ref: DeltaRef;
  severity: Severity;
  body: string;
  actions: string[];
};

// ---- injectable model client ----

/**
 * A model client takes the built prompt and returns the model's raw text. The
 * arbiter parses body + actions out of that text. Injectable so tests can pass
 * a deterministic offline fake.
 */
export type ModelClient = (prompt: PromptPayload) => Promise<string>;

const MODEL = "claude-opus-4-8";
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";

// ---- per-recipient at-risk file + severity (deterministic, schema §9) ----
//
// Seeded scenario: ben (api) was fenced -> severity 'fence', at routes/users.ts;
// chen (ui) was advised -> severity 'advisory', at UserCard.tsx. We resolve the
// at-risk file from the recipient's claim_files (their declared surface), and
// severity from whether the recipient directly references the renamed-away
// symbol (a deny-class hit -> 'fence') vs merely touches the area ('advisory').

const SEVERITY_BY_HUMAN: Record<string, Severity> = {
  ben: "fence",
  chen: "advisory",
};

/** The recipient's at-risk file: their first concrete (non-glob) claim file. */
export function atRiskFileFor(session: Session): string {
  const concrete = session.claim_files.find((f) => !f.includes("*"));
  return concrete ?? session.claim_files[0] ?? "(unknown)";
}

/**
 * Severity for a recipient against this delta. Seeded humans map to their
 * scenario severity; otherwise derive: a recipient that claims the bare
 * renamed-away symbol (a direct reference -> would be denied at the fence) is
 * 'fence'; one that only claims a property/area form is 'advisory'.
 */
export function severityFor(delta: Delta, session: Session): Severity {
  const seeded = SEVERITY_BY_HUMAN[session.human];
  if (seeded) return seeded;
  const mc = delta.mechanical_change;
  const stale =
    mc.kind === "rename_column"
      ? mc.from
      : mc.kind === "drop_column"
        ? mc.column
        : mc.kind === "api_field_renamed" || mc.kind === "api_field_removed"
          ? mc.from
          : undefined;
  if (!stale) return "advisory";
  // direct bare-symbol or dotted-symbol reference => fence-class.
  const directHit = session.claim_symbols.some(
    (s) => s === stale || s === `.${stale}`,
  );
  return directHit ? "fence" : "advisory";
}

/** Build the snake_case delta_ref from the delta (schema §6). */
export function deltaRefOf(delta: Delta): DeltaRef {
  const migration = deltaMigration(delta);
  return {
    contract_id: delta.contract_id,
    from_version: delta.from_version,
    to_version: delta.to_version,
    ...(migration ? { migration } : {}),
    author: delta.author,
  };
}

// ---- parse model text -> { body, actions } ----

/**
 * Pull body + actions out of the model's free text. The prompt asks for a short
 * body then concrete actions; we accept either a JSON object {body, actions} or
 * a prose blob with bullet/numbered action lines. We always guarantee >=1
 * action (schema §6 requires actions.length >= 1).
 */
export function parseModelText(text: string, delta: Delta): { body: string; actions: string[] } {
  const trimmed = text.trim();

  // 1) Try strict JSON {body, actions}.
  const json = tryParseJson(trimmed);
  if (json && typeof json.body === "string") {
    const actions = Array.isArray(json.actions)
      ? json.actions.map(String).map((s) => s.trim()).filter(Boolean)
      : [];
    return { body: json.body.trim(), actions: ensureActions(actions, delta) };
  }

  // 2) Prose: split off bullet/numbered lines as actions; the rest is body.
  const lines = trimmed.split(/\r?\n/);
  const bodyLines: string[] = [];
  const actions: string[] = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    const bullet = /^(?:[-*•]|\d+[.)])\s+(.*)$/.exec(line);
    if (bullet) {
      actions.push(bullet[1].trim());
    } else if (/^actions?\s*:?\s*$/i.test(line)) {
      // an "Actions:" header — skip it.
      continue;
    } else if (actions.length === 0) {
      bodyLines.push(line);
    } else {
      // a non-bullet line after actions started: treat as another action.
      actions.push(line);
    }
  }
  const body = bodyLines.join(" ").trim() || trimmed;
  return { body, actions: ensureActions(actions, delta) };
}

function tryParseJson(s: string): { body?: unknown; actions?: unknown } | null {
  // tolerate a fenced ```json block.
  const fence = /```(?:json)?\s*([\s\S]*?)```/.exec(s);
  const candidate = fence ? fence[1].trim() : s;
  if (!candidate.startsWith("{")) return null;
  try {
    return JSON.parse(candidate) as { body?: unknown; actions?: unknown };
  } catch {
    return null;
  }
}

/** Guarantee >=1 concrete action, synthesizing a re-sync step if none parsed. */
function ensureActions(actions: string[], delta: Delta): string[] {
  if (actions.length > 0) return actions;
  const mc = delta.mechanical_change;
  const fallback =
    mc.kind === "rename_column"
      ? `Update references from ${mc.from} to ${mc.to}, then re-sync to v${delta.to_version}.`
      : `Reconcile against ${delta.contract_id} and re-sync to v${delta.to_version}.`;
  return [fallback];
}

// ---- the default Opus 4.8 client (fetch, CLI fallback) ----

/**
 * defaultModelClient — calls claude-opus-4-8 via the Anthropic Messages API
 * over fetch (x-api-key from ANTHROPIC_API_KEY, anthropic-version 2023-06-01,
 * low effort). On any failure (no key, network, non-2xx), falls back to
 * shelling out to `claude -p --model claude-opus-4-8`.
 */
export const defaultModelClient: ModelClient = async (prompt: PromptPayload): Promise<string> => {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (apiKey) {
    try {
      return await callMessagesApi(prompt, apiKey);
    } catch {
      // fall through to the CLI fallback.
    }
  }
  return callClaudeCli(prompt);
};

async function callMessagesApi(prompt: PromptPayload, apiKey: string): Promise<string> {
  const res = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 1024,
      // low temperature == low effort: pin the judgment-layer output stable.
      output_config: { effort: "low" },
      system: prompt.system,
      messages: prompt.messages,
    }),
  });
  if (!res.ok) {
    throw new Error(`Anthropic API ${res.status}`);
  }
  const data = (await res.json()) as { content?: Array<{ type: string; text?: string }> };
  const text = (data.content ?? [])
    .filter((b) => b.type === "text" && typeof b.text === "string")
    .map((b) => b.text as string)
    .join("\n")
    .trim();
  if (!text) throw new Error("empty Anthropic response");
  return text;
}

/** Shell out to the local `claude` CLI as a fallback model path. */
function callClaudeCli(prompt: PromptPayload): Promise<string> {
  const systemText = prompt.system.map((b) => b.text).join("\n\n");
  const userText = prompt.messages
    .flatMap((m) => m.content.map((b) => b.text))
    .join("\n\n");
  const fullPrompt = `${systemText}\n\n${userText}`;

  return new Promise<string>((resolve, reject) => {
    const child = spawn("claude", ["-p", "--model", MODEL], {
      stdio: ["pipe", "pipe", "pipe"],
    });
    let out = "";
    let err = "";
    child.stdout.on("data", (d) => (out += String(d)));
    child.stderr.on("data", (d) => (err += String(d)));
    child.on("error", (e) => reject(e));
    child.on("close", (code) => {
      if (code === 0 && out.trim()) resolve(out.trim());
      else reject(new Error(`claude CLI exited ${code}: ${err.trim()}`));
    });
    child.stdin.write(fullPrompt);
    child.stdin.end();
  });
}

// ---- advise: assemble the Advisory ----

/**
 * advise — produce an Advisory for one (delta, recipient session) pair. The
 * model (injectable) writes body + actions; structural fields are assembled
 * deterministically. Async, off the critical path.
 */
export async function advise(
  delta: Delta,
  session: Session,
  modelClient: ModelClient = defaultModelClient,
): Promise<Advisory> {
  const file = atRiskFileFor(session);
  const severity = severityFor(delta, session);
  const prompt = buildPrompt(delta, session, file);

  const text = await modelClient(prompt);
  const { body, actions } = parseModelText(text, delta);

  return {
    recipient: session.human,
    session_id: session.id,
    file,
    delta_ref: deltaRefOf(delta),
    severity,
    body,
    actions,
  };
}
