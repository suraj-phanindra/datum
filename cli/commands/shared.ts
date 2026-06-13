// cli/commands/shared.ts — small helpers shared across cockpit/truth commands.

import type { Ctx } from "./types.ts";
import type { Delta } from "../../server/store.ts";

/**
 * Resolve the current epoch, fail-soft. Returns the bus epoch when reachable,
 * else the local last_synced_version with `reachable: false` so the caller can
 * render the local-cache view + a one-line warning.
 */
export async function resolveEpoch(
  ctx: Ctx,
): Promise<{ epoch: number; reachable: boolean; error?: string }> {
  const v = await ctx.bus.version();
  if (v.ok) return { epoch: v.registry_version, reachable: true };
  return { epoch: ctx.state.last_synced_version, reachable: false, error: v.error };
}

/** Deltas the session hasn't synced, fail-soft (empty on a down bus). */
export async function deltasSince(ctx: Ctx, since: number): Promise<Delta[]> {
  const d = await ctx.bus.deltas(since);
  return d.ok ? d.deltas : [];
}

/** Human-readable mechanical change phrase (snake_case wire delta). */
export function mechanicalText(mc: Delta["mechanical_change"]): string {
  switch (mc.kind) {
    case "rename_column":
      return `${mc.table}.${mc.from} → ${mc.to}`;
    case "add_column":
      return `+${mc.table}.${mc.column}`;
    case "drop_column":
      return `−${mc.table}.${mc.column}`;
    case "api_field_renamed":
      return `${mc.route} ${mc.from ?? "?"} → ${mc.to ?? "?"}`;
    case "api_field_removed":
      return `${mc.route} −${mc.from ?? "?"}`;
    case "dep_version_changed":
      return `${mc.dep} ${mc.from} → ${mc.to}`;
    case "decision":
      return mc.text;
    default:
      return "surface changed";
  }
}
