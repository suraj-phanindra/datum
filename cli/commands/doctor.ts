// cli/commands/doctor.ts — datum doctor. A ✓/✗ checklist with remediation:
//   - Node >= 22.6
//   - .datum/state.json present + valid
//   - .claude/settings.json has the 3 hooks (SessionStart/PostToolUse/PreToolUse)
//     + mcpServers.datum
//   - bus reachable (/healthz + /version)
//   - sync state (synced vs behind)
//
// Exit 2 when behind (drift), 1 on a critical wiring/bus issue, 0 when healthy.

import type { Command, Ctx } from "./types.ts";
import {
  out,
  emitJson,
  ambient,
  synced,
  fence,
  warn,
  mark,
  ident,
} from "../lib/format.ts";
import {
  readSettings,
  settingsPath,
  hasState,
  statePath,
  hookWired,
  mcpWired,
} from "../lib/state.ts";

type Check = {
  label: string;
  pass: boolean;
  detail: string;
  critical: boolean; // a failed critical check forces exit 1
  drift?: boolean; // a failed drift check forces exit 2
};

function nodeAtLeast(major: number, minor: number): boolean {
  const m = /^v(\d+)\.(\d+)/.exec(process.version);
  if (!m) return false;
  const maj = Number(m[1]);
  const min = Number(m[2]);
  return maj > major || (maj === major && min >= minor);
}

export const doctorCommand: Command = {
  name: "doctor",
  summary: "diagnostic checklist (✓/✗ + remediation)",
  usage: "datum doctor [--json]",
  group: "lifecycle",
  help: "Exit 0 healthy, 2 when behind the epoch (drift), 1 on a critical wiring/bus issue.",
  async run(ctx: Ctx) {
    const checks: Check[] = [];

    // 1) Node >= 22.6
    const nodeOk = nodeAtLeast(22, 6);
    checks.push({
      label: "node >= 22.6",
      pass: nodeOk,
      detail: nodeOk ? process.version : `${process.version} (upgrade node)`,
      critical: true,
    });

    // 2) .datum/state.json present + valid
    const statePresent = hasState(ctx.projectDir);
    checks.push({
      label: ".datum/state.json",
      pass: statePresent,
      detail: statePresent
        ? ident(statePath(ctx.projectDir))
        : "missing — run `datum init`",
      critical: true,
    });

    // 3) hooks + mcp wiring
    const settings = readSettings(settingsPath(ctx.projectDir));
    const hooks = [
      ["SessionStart", "datum-join"],
      ["PostToolUse", "datum-claim"],
      ["PreToolUse", "datum-fence"],
    ] as const;
    for (const [event, needle] of hooks) {
      const wired = hookWired(settings, event, needle);
      checks.push({
        label: `hook ${event}`,
        pass: wired,
        detail: wired ? ident(`${needle}.ts`) : "not wired — run `datum init`",
        critical: true,
      });
    }
    const mcp = mcpWired(settings);
    checks.push({
      label: "mcpServers.datum",
      pass: mcp,
      detail: mcp ? ident("server/mcp.ts") : "not registered — run `datum init`",
      critical: true,
    });

    // 4) bus reachable (/healthz + /version)
    const health = await ctx.bus.health();
    const vres = await ctx.bus.version();
    const reachable = health.ok && vres.ok;
    checks.push({
      label: "bus reachable",
      pass: reachable,
      detail: reachable ? ident(ctx.busUrl) : `${ctx.busUrl} (start with \`datum serve\`)`,
      critical: true,
    });

    // 5) sync state (synced vs behind) — drift, not critical.
    const epoch = vres.ok ? vres.registry_version : ctx.state.last_synced_version;
    const behind = Math.max(0, epoch - ctx.state.last_synced_version);
    const syncOk = behind === 0;
    checks.push({
      label: "sync state",
      pass: syncOk,
      detail: syncOk
        ? `synced to v${epoch}`
        : `off datum by ${behind} (run \`datum sync\`)`,
      critical: false,
      drift: true,
    });

    // ---- exit code: critical fail -> 1, else drift fail -> 2, else 0 ----
    const criticalFail = checks.some((c) => c.critical && !c.pass);
    const driftFail = checks.some((c) => c.drift && !c.pass);
    const code = criticalFail ? 1 : driftFail ? 2 : 0;

    if (ctx.json) {
      emitJson({
        ok: code === 0,
        exit: code,
        checks: checks.map((c) => ({ check: c.label, pass: c.pass, detail: c.detail })),
      });
      return code;
    }

    out(`${mark()} ${ident("datum doctor")}`);
    for (const c of checks) {
      const tick = c.pass ? synced("✓") : fence("✗");
      out(`  ${tick} ${c.label.padEnd(18)} ${ambient(c.detail)}`);
    }
    out("");
    if (code === 0) out(`  ${synced("healthy")} ${ambient("· all systems synced")}`);
    else if (code === 2) out(`  ${fence("drift")} ${ambient("· you are behind the epoch")}`);
    else out(`  ${fence("unhealthy")} ${ambient("· fix the ✗ items above")}`);
    return code;
  },
};
