// server/arbiter/prompt.ts — build the per-recipient Anthropic Messages request.
//
// Structure (schema §6 / arbiter PRD): a CACHED/SHARED prefix (the delta + the
// contract context, identical for every recipient of this delta) followed by
// the recipient's MANIFEST SLICE (their claimed files/symbols + their at-risk
// file). The shared prefix is byte-identical across recipients so Anthropic's
// prompt cache reads it once and only the small per-recipient tail varies
// (shared/prompt-caching.md: stable content first, volatile content last).
//
// Returns { system, messages } shaped for the Anthropic Messages API. The
// system blocks carry a cache_control breakpoint on the last shared block.

import type { Delta, Session } from "../store.ts";

// A content block shaped for the Anthropic Messages API (system / user text).
export type TextBlock = {
  type: "text";
  text: string;
  cache_control?: { type: "ephemeral" };
};

export type MessageParam = {
  role: "user" | "assistant";
  content: TextBlock[];
};

export type PromptPayload = {
  system: TextBlock[];
  messages: MessageParam[];
};

/** Human-readable one-line description of the delta's mechanical change. */
export function describeMechanicalChange(delta: Delta): string {
  const mc = delta.mechanical_change;
  switch (mc.kind) {
    case "rename_column": {
      const mig = mc.migration ? ` (migration ${mc.migration})` : "";
      return `${mc.table}.${mc.from} was renamed to ${mc.table}.${mc.to}${mig}`;
    }
    case "add_column":
      return `${mc.table}.${mc.column} was added${mc.migration ? ` (migration ${mc.migration})` : ""}`;
    case "drop_column":
      return `${mc.table}.${mc.column} was dropped${mc.migration ? ` (migration ${mc.migration})` : ""}`;
    case "api_field_renamed":
      return `${mc.route} field ${mc.from} was renamed to ${mc.to}`;
    case "api_field_removed":
      return `${mc.route} field ${mc.from} was removed`;
    case "dep_version_changed":
      return `${mc.dep} ${mc.from} -> ${mc.to}`;
    case "decision":
      return mc.text;
  }
}

/**
 * The migration identifier carried by the delta, if any (e.g. "0042"). Only
 * column-level changes carry it.
 */
export function deltaMigration(delta: Delta): string | undefined {
  const mc = delta.mechanical_change;
  if (mc.kind === "rename_column" || mc.kind === "add_column" || mc.kind === "drop_column") {
    return mc.migration;
  }
  return undefined;
}

/**
 * The shared/cached prefix: the delta + the contract context. Byte-identical
 * for every recipient of the same delta, so it caches cleanly. This is the
 * arbiter's "system" — the judgment criteria plus the facts of the change.
 */
export function sharedPrefix(delta: Delta): TextBlock[] {
  const change = describeMechanicalChange(delta);
  const intro =
    "You are Datum's arbiter — the judgment layer that runs AFTER a contract-surface " +
    "delta lands in a shared workspace. A teammate just changed a contract that other " +
    "teammates are building against. Your job: write ONE tailored advisory for ONE " +
    "recipient, telling THEM exactly how this change breaks THEIR open work and what " +
    "to do about it. Address the recipient directly and imperatively. Be specific to " +
    "their file and their task — never generic. Reference the contract, the mechanical " +
    "change, and the author by name. Keep it tight: a couple of sentences of body plus " +
    "concrete actions.";

  const contractContext =
    `CONTRACT DELTA (epoch ${delta.epoch}):\n` +
    `  contract: ${delta.contract_id}\n` +
    `  version: v${delta.from_version} -> v${delta.to_version}\n` +
    `  author: ${delta.author}\n` +
    `  change: ${change}\n` +
    `  why (${delta.author}): "${delta.why}"`;

  return [
    { type: "text", text: intro },
    // breakpoint on the last shared block: caches intro + contract context.
    { type: "text", text: contractContext, cache_control: { type: "ephemeral" } },
  ];
}

/**
 * The per-recipient manifest slice: their claimed files/symbols and the at-risk
 * file. This is the volatile tail — it varies per recipient, so it goes after
 * the cached prefix and never carries a cache breakpoint.
 */
export function recipientSlice(delta: Delta, session: Session, atRiskFile: string): MessageParam[] {
  const change = describeMechanicalChange(delta);
  const body =
    `RECIPIENT: ${session.human} (session ${session.id}, branch ${session.branch})\n` +
    `THEIR CLAIMED FILES: ${session.claim_files.join(", ")}\n` +
    `THEIR CLAIMED SYMBOLS: ${session.claim_symbols.join(", ")}\n` +
    `THEIR AT-RISK FILE: ${atRiskFile}\n\n` +
    `Write the advisory for ${session.human}. Their work on ${atRiskFile} touches the ` +
    `changed surface (${change}). Explain precisely how ${atRiskFile} breaks and what ${session.human} ` +
    `must do before their next write. Reference ${delta.contract_id}, the rename/change, and ${delta.author}.`;

  return [{ role: "user", content: [{ type: "text", text: body }] }];
}

/**
 * buildPrompt — assemble { system, messages } for one recipient: cached shared
 * prefix (delta + contract context) as `system`, recipient manifest slice as
 * the user `messages`.
 */
export function buildPrompt(delta: Delta, session: Session, atRiskFile: string): PromptPayload {
  return {
    system: sharedPrefix(delta),
    messages: recipientSlice(delta, session, atRiskFile),
  };
}
