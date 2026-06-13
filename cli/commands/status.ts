// cli/commands/status.ts — the terminal tower-glance.
//
// Header (⌖ datum · <workspace>), epoch strip (…vN live), YOUR sync state
// (synced to vN / off datum by M epochs), your claim (files + symbols), live
// sessions + presence initials, recent deltas, your pending advisories.
//
// Fail-soft: a down bus renders the local-cache view from .datum/state.json with
// a one-line warning, never a stack trace. --json emits a machine record.

import { basename } from "node:path";

import type { Command, Ctx } from "./types.ts";
import type { Delta, Session } from "../../server/store.ts";
import {
  out,
  emitJson,
  ambient,
  contract,
  fence,
  advisory,
  synced,
  bold,
  mark,
  ident,
  epochStrip,
  syncPhrase,
  presence,
  relTime,
} from "../lib/format.ts";
import { mechanicalText } from "./shared.ts";

function workspaceName(ctx: Ctx): string {
  // §10: the team is the repo — prefer the derived workspace_id, fall back to the
  // project dir basename for a pre-team (or non-git) checkout.
  return ctx.state.workspace_id || basename(ctx.projectDir) || "workspace";
}

export const statusCommand: Command = {
  name: "status",
  summary: "the cockpit glance: epoch, your sync state, presence, deltas",
  usage: "datum status [--json]",
  group: "cockpit",
  async run(ctx) {
    const state = ctx.state;
    const vres = await ctx.bus.version();
    const reachable = vres.ok;
    const epoch = vres.ok ? vres.registry_version : state.last_synced_version;

    // pull roster, deltas, advisories — all fail-soft.
    const [sessRes, deltaRes, advRes] = await Promise.all([
      ctx.bus.sessions(),
      ctx.bus.deltas(state.last_synced_version),
      state.session_id ? ctx.bus.advisories(state.session_id) : Promise.resolve({ ok: true as const, advisories: [] }),
    ]);
    const sessions: Session[] = sessRes.ok ? sessRes.sessions : [];
    const deltas: Delta[] = deltaRes.ok ? deltaRes.deltas : [];
    const advisories = advRes.ok ? advRes.advisories : [];
    const behind = Math.max(0, epoch - state.last_synced_version);

    if (ctx.json) {
      emitJson({
        workspace: workspaceName(ctx),
        workspace_id: state.workspace_id,
        bus_reachable: reachable,
        epoch,
        session_id: state.session_id,
        human: state.human,
        branch: state.branch,
        last_synced_version: state.last_synced_version,
        behind,
        sync_state: behind === 0 ? `synced to v${epoch}` : `off datum by ${behind}`,
        claim_files: state.claim_files,
        claim_symbols: state.claim_symbols,
        sessions: sessions.map((s) => ({
          human: s.human,
          branch: s.branch,
          status: s.status,
          last_synced_version: s.last_synced_version,
        })),
        deltas,
        advisories,
      });
      return reachable ? 0 : 0;
    }

    // ---- header + epoch strip ----
    // §10: the workspace line reads "team · <workspace_id>".
    out(`${mark()} ${bold("datum")} ${ambient("·")} ${ambient("team")} ${ambient("·")} ${ident(workspaceName(ctx))}`);
    out(`  ${ambient("epoch")}  ${epochStrip(epoch)}`);
    if (!reachable) {
      out(ambient(`  bus unreachable — showing local cache (synced to v${state.last_synced_version})`));
    }
    out("");

    // ---- your sync state + claim ----
    const who = state.human ? ident(state.human) : ident("(unset)");
    const branch = state.branch ? ambient(`· ${ident(state.branch)}`) : "";
    out(`  you   ${who} ${branch}`);
    out(`        ${syncPhrase(state.last_synced_version, epoch)}`);
    if (state.claim_files.length || state.claim_symbols.length) {
      const files = state.claim_files.length ? ident(state.claim_files.join(", ")) : ambient("none");
      const syms = state.claim_symbols.length ? ident(state.claim_symbols.join(", ")) : ambient("none");
      out(`        ${ambient("claim")} files ${files}`);
      out(`        ${ambient("     ")} syms  ${syms}`);
    }
    out("");

    // ---- live sessions + presence ----
    if (sessions.length) {
      out(`  ${ambient("sessions")}`);
      for (const s of sessions) {
        const tick = tickFor(s.status);
        const sync = s.last_synced_version >= epoch ? synced(`v${s.last_synced_version}`) : fence(`v${s.last_synced_version}`);
        out(
          `    ${presence(s.human)} ${ident(s.human.padEnd(5))} ${ambient(s.branch.padEnd(12))} ${tick} ${ambient(s.status.padEnd(11))} ${sync}`,
        );
      }
      out("");
    }

    // ---- recent deltas (since your last sync) ----
    if (deltas.length) {
      out(`  ${contract("deltas")} ${ambient("since your last sync")}`);
      for (const d of deltas.slice(-5)) {
        out(
          `    ${contract(`v${d.epoch}`)} ${ident(d.contract_id)} ${ambient("·")} ${ident(mechanicalText(d.mechanical_change))} ${ambient(`· ${d.author} ${relTime(d.ts)}`)}`,
        );
      }
      out("");
    }

    // ---- your advisories ----
    if (advisories.length) {
      out(`  ${advisory("advisories")} ${ambient("for you")}`);
      for (const a of advisories as Array<Record<string, unknown>>) {
        const sev = String(a.severity ?? "advisory");
        const tone = sev === "fence" ? fence : advisory;
        const file = ident(String(a.file ?? ""));
        out(`    ${tone(`[${sev}]`)} ${file}`);
        out(`      ${ambient(String(a.body ?? ""))}`);
      }
      out("");
    }

    // ---- footer ----
    const footer = behind === 0
      ? synced(`synced to v${epoch}`)
      : fence(`off datum by ${behind} ${behind === 1 ? "version" : "versions"}`);
    const last = deltas.length ? ambient(` · last delta ${relTime(deltas[deltas.length - 1].ts)}`) : "";
    out(`  ${mark()} ${footer}${last}`);

    return 0;
  },
};

function tickFor(status: string): string {
  switch (status) {
    case "fenced":
      return fence("✗");
    case "reconciling":
      return advisory("↻");
    case "reconciled":
      return synced("✓");
    case "live":
      return ambient("●");
    default:
      return ambient("·");
  }
}
