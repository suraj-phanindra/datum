// cloud/test/workspace-bus.test.ts
//
// Proves the WorkspaceBus Durable Object runs the *same* coordination core
// (server/store.ts + registry + watchlist + routeBus) over DO SQLite storage.
// This is the WS2a verification predicate: a contract-surface edit bumps the
// monotonic registry version by exactly 1, /deltas?since=prev returns the
// mechanical delta, and /registry reflects the new version.
//
// Run: cd cloud && npx vitest (config: @cloudflare/vitest-pool-workers).
//
// Test API: `env` from "cloudflare:test" carries the Worker bindings declared
// in wrangler.jsonc (the WORKSPACE_BUS DurableObjectNamespace). We address the
// per-workspace DO with idFromName(workspace_id) -> get(id), mirroring the
// production router's getByName(workspace_id), and drive it over stub.fetch()
// exactly as the Worker forwards requests to it.
//
// The event payload shape mirrors the node fixtures in /test (bus.test.ts,
// router.test.ts): a `type: "edit.streamed"` POST /events on a
// migrations/*.sql rename, which the shared watchlist classifies as a
// db.users rename_column (email -> contact_email) and bumps the epoch 7 -> 8.

import { env } from "cloudflare:test";
import { describe, it, expect } from "vitest";

// Same scenario constants the OSS node tests use, so the DO is proven to run
// the identical core. These live in the backend-agnostic core under server/.
import { ASHA_MIGRATION_AFTER, ASHA_WHY } from "../../server/seed.ts";

interface Env {
  WORKSPACE_BUS: DurableObjectNamespace;
}

const ENV = env as unknown as Env;

// A test workspace_id keyed exactly like the git-native client derives it
// (host/owner/repo). The DO adopts the first workspace_id it sees and is
// isolated per workspace by construction.
const WORKSPACE_ID = "acme/workspaces";

// The DO only speaks HTTP at its `fetch` handler; the origin is irrelevant
// (the Worker strips the /w/:workspace_id prefix before forwarding), so we use
// a fixed dummy origin and the bare bus paths the core router matches.
const ORIGIN = "https://do.internal";

function stub() {
  // Address the per-workspace DO by name, mirroring env.WORKSPACE_BUS
  // .getByName(workspace_id) in the production router.
  const id = ENV.WORKSPACE_BUS.idFromName(WORKSPACE_ID);
  return ENV.WORKSPACE_BUS.get(id);
}

async function jget(path: string): Promise<{ status: number; body: any }> {
  const res = await stub().fetch(`${ORIGIN}${path}`);
  return { status: res.status, body: await res.json() };
}

async function jpost(
  path: string,
  body: unknown,
  method = "POST",
): Promise<{ status: number; body: any }> {
  const res = await stub().fetch(`${ORIGIN}${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
}

describe("WorkspaceBus DO: shared core over DO SQLite", () => {
  it("a contract-surface edit bumps the registry version by exactly 1, exposes the delta, and updates the registry", async () => {
    // ---- baseline: read the version the DO starts at ----
    // A fresh DO with no seed boots at the genesis epoch; if the test env is
    // seeded to the pre-delta state it boots at 7. Either way we assert the
    // *increment* is exactly 1, which is the invariant that matters (the
    // monotonic bump), not the absolute starting number.
    const health = await jget("/healthz");
    expect(health.status).toBe(200);
    expect(health.body.ok).toBe(true);

    const before = await jget("/version");
    expect(before.status).toBe(200);
    const prev: number = before.body.registry_version;
    expect(typeof prev).toBe("number");

    // ---- POST a contract-surface edit: asha's migration rename ----
    // Same fixture shape as test/bus.test.ts / test/router.test.ts: an
    // edit.streamed on migrations/*.sql that renames users.email ->
    // contact_email. The DO classifies it via the shared watchlist inside one
    // transactionSync and bumps the monotonic version.
    const edit = await jpost("/events", {
      type: "edit.streamed",
      session_id: "sess-asha",
      human: "asha",
      tool_name: "Write",
      path: "migrations/0042_rename.sql",
      after: ASHA_MIGRATION_AFTER,
      why: ASHA_WHY,
    });
    expect(edit.status).toBe(200);
    expect(edit.body.ok).toBe(true);

    // The version incremented by exactly 1.
    const next = prev + 1;
    expect(edit.body.registry_version).toBe(next);

    // The returned delta describes the mechanical rename, on db.users,
    // crossing prev -> next. (mirrors the node fixtures' assertions.)
    expect(edit.body.delta).toBeTruthy();
    expect(edit.body.delta.contract_id).toBe("db.users");
    expect(edit.body.delta.from_version).toBe(prev);
    expect(edit.body.delta.to_version).toBe(next);
    expect(edit.body.delta.epoch).toBe(next);
    expect(edit.body.delta.mechanical_change.kind).toBe("rename_column");
    expect(edit.body.delta.mechanical_change.from).toBe("email");
    expect(edit.body.delta.mechanical_change.to).toBe("contact_email");

    // ---- GET /version reflects the bump (+1) ----
    const after = await jget("/version");
    expect(after.status).toBe(200);
    expect(after.body.registry_version).toBe(next);

    // ---- GET /deltas?since=prev returns exactly the one delta ----
    const deltas = await jget(`/deltas?since=${prev}`);
    expect(deltas.status).toBe(200);
    expect(Array.isArray(deltas.body.deltas)).toBe(true);
    expect(deltas.body.deltas.length).toBe(1);
    expect(deltas.body.deltas[0].contract_id).toBe("db.users");
    expect(deltas.body.deltas[0].to_version).toBe(next);

    // ---- GET /registry shows the new version + db.users at current_version=next ----
    const reg = await jget("/registry");
    expect(reg.status).toBe(200);
    expect(reg.body.registry_version).toBe(next);
    expect(Array.isArray(reg.body.contracts)).toBe(true);
    const dbUsers = reg.body.contracts.find((c: any) => c.id === "db.users");
    expect(dbUsers).toBeTruthy();
    expect(dbUsers.current_version).toBe(next);
  });

  it("an off-watchlist edit does not bump the version (the DO runs the same watchlist)", async () => {
    const before = await jget("/version");
    const prev: number = before.body.registry_version;

    const readme = await jpost("/events", {
      type: "edit.streamed",
      session_id: "sess-asha",
      human: "asha",
      tool_name: "Write",
      path: "README.md",
      after: "# Workspace invites\n",
    });
    expect(readme.status).toBe(200);
    expect(readme.body.registry_version).toBe(prev);
    expect(readme.body.delta).toBeUndefined();

    const after = await jget("/version");
    expect(after.body.registry_version).toBe(prev);
  });
});
