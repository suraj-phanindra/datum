// cli/commands/version.ts — datum version / -v.
//
// Prints the datum version, the node version, and the resolved bus url. In
// --json mode emits a machine record.

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import type { Command } from "./types.ts";
import { out, emitJson, ambient, mark, ident } from "../lib/format.ts";

const HERE = dirname(fileURLToPath(import.meta.url));

export function datumVersion(): string {
  try {
    const pkg = JSON.parse(
      readFileSync(join(HERE, "..", "..", "package.json"), "utf8"),
    ) as { version?: string };
    return pkg.version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
}

export const versionCommand: Command = {
  name: "version",
  summary: "print datum + node version and the bus url",
  usage: "datum version",
  group: "lifecycle",
  async run(ctx) {
    const version = datumVersion();
    if (ctx.json) {
      emitJson({ datum: version, node: process.version, bus_url: ctx.busUrl });
      return 0;
    }
    out(`${mark()} ${ident(`datum ${version}`)}`);
    out(ambient(`node ${process.version} · bus ${ctx.busUrl}`));
    return 0;
  },
};
