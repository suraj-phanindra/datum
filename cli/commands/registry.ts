// cli/commands/registry.ts — datum registry (alias `truth`). Contracts + versions
// + presence avatars (initials of sessions building against each contract).

import type { Command, Ctx } from "./types.ts";
import type { Contract, Session } from "../../server/store.ts";
import {
  out,
  emitJson,
  ambient,
  contract as amber,
  warn,
  mark,
  ident,
  table,
  presence,
  vtag,
} from "../lib/format.ts";

/** Sessions whose claim touches a contract, by simple id/symbol/file overlap. */
function presenceFor(c: Contract, sessions: Session[]): string[] {
  const id = c.id.toLowerCase();
  const table = id.startsWith("db.") ? id.slice(3) : "";
  const hits = sessions.filter((s) => {
    const fileHit = s.claim_files.some((f) => table && f.toLowerCase().includes(table));
    const symHit = s.claim_symbols.some((sym) => table && sym.toLowerCase().includes(table));
    const routeHit =
      id.startsWith("api.") &&
      s.claim_files.some((f) => /routes\//.test(f.toLowerCase()) || /\.controller\.ts$/.test(f.toLowerCase()));
    return fileHit || symHit || routeHit;
  });
  return hits.map((s) => s.human);
}

export const registryCommand: Command = {
  name: "registry",
  aliases: ["truth"],
  summary: "the current truth: contracts + versions + presence",
  usage: "datum registry [--json]",
  group: "truth",
  async run(ctx: Ctx) {
    const res = await ctx.bus.registry();
    if (!res.ok) {
      warn(`registry: bus unreachable at ${ctx.busUrl} (${res.error}).`);
      return 1;
    }
    const sessRes = await ctx.bus.sessions();
    const sessions: Session[] = sessRes.ok ? sessRes.sessions : [];

    if (ctx.json) {
      emitJson({
        registry_version: res.registry_version,
        contracts: res.contracts.map((c) => ({
          id: c.id,
          type: c.type,
          version: c.current_version,
          presence: presenceFor(c, sessions),
        })),
      });
      return 0;
    }

    out(`${mark()} ${amber("registry")} ${ambient(`· truth at`)} ${vtag(res.registry_version)}`);
    out("");
    const rows = res.contracts.map((c) => {
      const who = presenceFor(c, sessions);
      const avatars = who.length ? who.map(presence).join("") : ambient("—");
      return [`  ${ident(c.id)}`, ident(c.type), avatars, vtag(c.current_version)];
    });
    out(table(rows, { gutter: 2 }));
    return 0;
  },
};
