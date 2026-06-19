// server/arbiter/model-client-node.ts: the node-backed default ModelClient.
//
// This is the OSS arbiter's model path (server/arbiter/index.ts -> runArbiter):
// it calls claude-opus-4-8 via the Anthropic Messages API over fetch, and on any
// failure (no key, network, non-2xx) falls back to shelling out to the local
// `claude` CLI. The CLI fallback is the ONLY reason node:child_process appears in
// the arbiter, so it is quarantined here (off advise.ts, which must stay node-free
// for the Cloudflare bundle). The Datum Cloud arbiter (a separate private repo)
// uses its own fetch-only client instead.

import { spawn } from "node:child_process";
import type { ModelClient } from "./advise.ts";
import type { PromptPayload } from "./prompt.ts";

const MODEL = "claude-opus-4-8";
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";

/**
 * defaultModelClient: calls claude-opus-4-8 via the Anthropic Messages API
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
    child.stdout.on("data", (d: unknown) => (out += String(d)));
    child.stderr.on("data", (d: unknown) => (err += String(d)));
    child.on("error", (e: unknown) => reject(e instanceof Error ? e : new Error(String(e))));
    child.on("close", (code: number | null) => {
      if (code === 0 && out.trim()) resolve(out.trim());
      else reject(new Error(`claude CLI exited ${code}: ${err.trim()}`));
    });
    child.stdin.write(fullPrompt);
    child.stdin.end();
  });
}
