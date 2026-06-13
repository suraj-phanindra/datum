// cli/commands/team.ts — datum team. `git shortlog` for the live fleet (§10).
//
// Shows the team: the workspace_id (the team key derived from the git remote),
// the shared bus_url, and the LIVE ROSTER from GET /sessions — each member's
// human/email/branch/claim/status/synced version. The team IS the repo; presence
// keys on the member, derived from git identity.
//
// Fail-soft: a down bus renders the local-cache identity + a one-line note, never
// a stack trace. --json emits a machine record.

import type { Command, Ctx } from "./types.ts";
import type { Session } from "../../server/store.ts";
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
  presence,
} from "../lib/format.ts";

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

/** The team's workspace id: local state first, else the bus's served workspace. */
function workspaceId(ctx: Ctx, served: string): string {
  return ctx.state.workspace_id || served || "local/(uninitialised)";
}

export const teamCommand: Command = {
  name: "team",
  aliases: ["roster"],
  summary: "the team: workspace, shared bus, and the live roster",
  usage: "datum team [--json]",
  group: "cockpit",
  help:
    "The team is the repo. `datum team` is git shortlog for the live fleet: the\n" +
    "workspace_id (derived from the git remote), the shared bus_url, and every\n" +
    "member's identity + claim + sync state from GET /sessions.",
  async run(ctx) {
    const [sessRes, vRes] = await Promise.all([ctx.bus.sessions(), ctx.bus.version()]);
    const reachable = sessRes.ok;
    const sessions: Session[] = sessRes.ok ? sessRes.sessions : [];
    const epoch = vRes.ok ? vRes.registry_version : ctx.state.last_synced_version;
    // the bus's served workspace, if any session reports one.
    const served = sessions.find((s) => s.workspace_id)?.workspace_id ?? "";
    const workspace = workspaceId(ctx, served);

    if (ctx.json) {
      emitJson({
        workspace_id: workspace,
        bus_url: ctx.busUrl,
        bus_reachable: reachable,
        epoch,
        members: sessions.map((s) => ({
          human: s.human,
          email: s.email,
          branch: s.branch,
          status: s.status,
          last_synced_version: s.last_synced_version,
          synced: s.last_synced_version >= epoch,
          claim_files: s.claim_files,
          claim_symbols: s.claim_symbols,
        })),
      });
      return 0;
    }

    // ---- header ----
    out(`${mark()} ${bold("datum team")} ${ambient("·")} ${contract(ident(workspace))}`);
    out(`  ${ambient("bus")}   ${ident(ctx.busUrl)}`);
    if (!reachable) {
      out(ambient(`  bus unreachable — showing local identity (you: ${ident(ctx.state.human || "unset")})`));
      // even offline, show who *you* are so the team key is legible.
      const who = ctx.state.human ? ident(ctx.state.human) : ident("(unset)");
      const email = ctx.state.email ? ambient(` <${ctx.state.email}>`) : "";
      const branch = ctx.state.branch ? ambient(` · ${ident(ctx.state.branch)}`) : "";
      out("");
      out(`  ${presence(ctx.state.human)} ${who}${email}${branch}`);
      out("");
      out(ambient(`  ${mark()} run \`datumctl serve\` then \`datum init\` per engineer to populate the roster`));
      return 0;
    }
    out("");

    // ---- roster ----
    if (!sessions.length) {
      out(ambient("  no members joined yet — run `datum init` per engineer + start a Claude Code session"));
      return 0;
    }

    out(`  ${ambient("roster")} ${ambient(`(${sessions.length} ${sessions.length === 1 ? "member" : "members"})`)}`);
    for (const s of sessions) {
      const tick = tickFor(s.status);
      const sync =
        s.last_synced_version >= epoch
          ? synced(`v${s.last_synced_version}`)
          : fence(`v${s.last_synced_version}`);
      const email = s.email ? ambient(s.email.padEnd(18)) : ambient("".padEnd(18));
      out(
        `    ${presence(s.human)} ${ident(s.human.padEnd(6))} ${email} ${ambient(s.branch.padEnd(12))} ${tick} ${ambient(s.status.padEnd(11))} ${sync}`,
      );
      const claim = [...s.claim_files, ...s.claim_symbols].filter(Boolean);
      if (claim.length) {
        out(`        ${ambient("claim")} ${ident(claim.join(", "))}`);
      }
    }
    out("");
    out(`  ${mark()} ${synced(`team at v${epoch}`)} ${ambient("· membership = having the repo")}`);
    return 0;
  },
};
