// cli/commands/show.ts — datum show <contract>. One contract: current value,
// version history (who/when/why per epoch), and who is building against it.
// e.g. `datum show db.users` includes the users.email -> contact_email rename.

import type { Command, Ctx } from "./types.ts";
import type { ContractVersion, Session } from "../../server/store.ts";
import {
  out,
  emitJson,
  ambient,
  contract as amber,
  warn,
  mark,
  ident,
  presence,
  vtag,
  relTime,
} from "../lib/format.ts";
import { mechanicalText } from "./shared.ts";

export const showCommand: Command = {
  name: "show",
  summary: "one contract: value + version history (who/when/why)",
  usage: "datum show <contract>",
  group: "truth",
  async run(ctx: Ctx) {
    const id = ctx.args.join(" ").trim();
    if (!id) {
      warn("show: needs a contract, e.g. datum show db.users");
      return 1;
    }
    const res = await ctx.bus.contractVersions(id);
    if (!res.ok) {
      warn(`show: bus unreachable at ${ctx.busUrl} (${res.error}).`);
      return 1;
    }
    if (!res.contract) {
      warn(`show: no contract "${id}".`);
      return 1;
    }
    const versions = res.versions as ContractVersion[];
    const sessRes = await ctx.bus.sessions();
    const sessions: Session[] = sessRes.ok ? sessRes.sessions : [];
    const builders = whoBuilds(id, sessions);

    if (ctx.json) {
      emitJson({
        contract: {
          id: res.contract.id,
          type: res.contract.type,
          current_version: res.contract.current_version,
          current_value: safeJson(res.contract.current_value),
        },
        versions: versions.map((v) => ({
          version: v.version,
          epoch: v.epoch,
          author: v.author,
          ts: v.ts,
          why: v.why,
          mechanical_change: v.mechanical_change,
        })),
        builders,
      });
      return 0;
    }

    out(`${mark()} ${ident(res.contract.id)} ${ambient(`· ${res.contract.type} ·`)} ${vtag(res.contract.current_version)}`);
    out(`  ${ambient("value")} ${ident(prettyValue(res.contract.current_value))}`);
    if (builders.length) {
      out(`  ${ambient("building")} ${builders.map(presence).join("")} ${ambient(builders.join(", "))}`);
    }
    out("");
    out(`  ${amber("history")}`);
    if (versions.length === 0) {
      out(ambient("    (no recorded version history)"));
    } else {
      for (const v of [...versions].reverse()) {
        out(
          `    ${amber(`v${v.version}`)} ${ambient(`epoch v${v.epoch}`)} ${ident(mechanicalText(v.mechanical_change))}`,
        );
        out(`        ${ambient(`${v.author} · ${relTime(v.ts)} · "${v.why}"`)}`);
      }
    }
    return 0;
  },
};

function whoBuilds(id: string, sessions: Session[]): string[] {
  const tbl = id.toLowerCase().startsWith("db.") ? id.slice(3).toLowerCase() : "";
  return sessions
    .filter((s) => {
      if (tbl) {
        return (
          s.claim_files.some((f) => f.toLowerCase().includes(tbl)) ||
          s.claim_symbols.some((sym) => sym.toLowerCase().includes(tbl))
        );
      }
      if (id.toLowerCase().startsWith("api.")) {
        return s.claim_files.some((f) => /routes\//.test(f.toLowerCase()) || /\.controller\.ts$/.test(f.toLowerCase()));
      }
      return false;
    })
    .map((s) => s.human);
}

function safeJson(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return s;
  }
}

function prettyValue(s: string): string {
  try {
    return JSON.stringify(JSON.parse(s));
  } catch {
    return s;
  }
}
