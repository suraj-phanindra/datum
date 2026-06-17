// cli/commands/login.ts — datum login --bus <url> [--token <token>].
//
// Authenticate the CLI + hooks against a HOSTED bus (Datum Cloud). Persists the
// bus url + bearer token into LOCAL, gitignored state (.datum/state.json) — NEVER
// the committed datum.json — so one machine can run in cloud mode without leaking
// the secret to the team via git.
//
// Two paths:
//   --token <t>  : non-interactive. Save bus_url + token, confirm.
//   (no token)   : print <bus>/auth/login + instructions, then read the pasted
//                  token from stdin and save it.
//
// The token is never printed back in full (masked to the last 4 chars). Without a
// --bus, falls back to the resolved bus url so `datum login --token <t>` still
// works against an already-configured bus.

import { readFileSync } from "node:fs";

import type { Command, Ctx } from "./types.ts";
import { patchState } from "../lib/state.ts";
import { deriveWorkspaceId } from "../lib/git.ts";
import { out, emitJson, ambient, synced, warn, mark, ident } from "../lib/format.ts";

function str(v: string | boolean | undefined): string | undefined {
  return typeof v === "string" && v ? v : undefined;
}

/** Read a single pasted line (the token) from stdin, fail-soft. */
function readStdinLine(): string {
  try {
    return readFileSync(0, "utf8").trim();
  } catch {
    return "";
  }
}

/** Mask a token to its last 4 chars so it is never echoed in full. */
function mask(token: string): string {
  if (token.length <= 4) return "****";
  return `…${token.slice(-4)}`;
}

export const loginCommand: Command = {
  name: "login",
  summary: "authenticate the CLI + hooks against a hosted bus (cloud mode)",
  usage: "datum login --bus <url> [--token <token>]",
  group: "lifecycle",
  help:
    "Persists the hosted bus url + bearer token into local, gitignored state\n" +
    "(.datum/state.json) — never the committed datum.json. With --token the\n" +
    "save is non-interactive; without it, open <bus>/auth/login in a browser,\n" +
    "copy the token it gives you, and paste it on stdin.",
  async run(ctx: Ctx) {
    // --bus wins; otherwise reuse the resolved bus url (state/env/default).
    const host = (str(ctx.flags.bus) || ctx.busUrl).replace(/\/$/, "");
    if (!host) {
      warn("login: a hosted bus url is required, e.g. datum login --bus https://bus.datum.dev");
      return 1;
    }

    // Scope the bus url to this workspace as a single encoded path segment
    // (/w/<encoded workspace_id>), unless it is already workspace-scoped. The hooks
    // and client then use bus_url + path unchanged; the worker decodes the segment.
    let bus = host;
    if (!/\/w\//.test(host)) {
      const ws = deriveWorkspaceId(ctx.projectDir);
      if (ws) bus = `${host}/w/${encodeURIComponent(ws)}`;
    }

    let token = str(ctx.flags.token);

    // interactive path: print the login URL + instructions, then read the token.
    if (!token) {
      const loginUrl = `${host}/auth/login`;
      if (!ctx.json) {
        out(`${mark()} authenticate at ${ident(loginUrl)}`);
        out(ambient("  1. open the url above in your browser and sign in"));
        out(ambient("  2. copy the token it gives you"));
        out(ambient("  3. paste it here (then press Enter / Ctrl-D)"));
      }
      token = readStdinLine() || undefined;
      if (!token) {
        warn(`login: no token provided. Get one at ${loginUrl}, then re-run with --token <token>.`);
        return 1;
      }
    }

    // persist to LOCAL gitignored state only (never datum.json).
    patchState({ bus_url: bus, token }, ctx.projectDir);

    if (ctx.json) {
      emitJson({ ok: true, bus_url: bus, cloud_mode: true, token: mask(token) });
      return 0;
    }

    out(
      `${mark()} ${synced("logged in")} to ${ident(host)} ` +
        ambient(`(token ${mask(token)})`),
    );
    out(ambient("  the CLI + hooks now run in cloud mode against that bus."));
    return 0;
  },
};
