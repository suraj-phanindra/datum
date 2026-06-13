// server/seed.ts — load the schema §9 sample data (the workspace-invites
// scenario) into a Store. Used by tests and the demo to put the registry into
// the pre-delta state: epoch 7, db.users at v7, the other contracts seeded, and
// ledger #110/#111 only (so the first live delta -> #112).
//
// This is data, not logic; no model touches it.

import type { Store, Session } from "./store.ts";

/**
 * Seed the registry to the pre-asha-delta state (schema §9):
 *   - registry_version (epoch) = 7
 *   - db.users v7 (about to go v8), api.GET /users/:id v3, api.POST /invites v1,
 *     deps.db-driver v2
 *   - ledger #110 (ben) + #111 (chen) only, so the next auto id is 112
 *   - the three sessions asha/ben/chen with their claims (intersection fixture)
 */
export function seedScenario(store: Store): void {
  store.setVersion(7);

  store.upsertContract({
    id: "db.users",
    name: "db.users",
    type: "db_schema",
    current_version: 7,
    current_value: JSON.stringify({ table: "users", columns: ["id", "email", "name"] }),
  });
  store.upsertContract({
    id: "api.GET /users/:id",
    name: "api.GET /users/:id",
    type: "api_shape",
    current_version: 3,
    current_value: JSON.stringify({ route: "GET /users/:id" }),
  });
  store.upsertContract({
    id: "api.POST /invites",
    name: "api.POST /invites",
    type: "api_shape",
    current_version: 1,
    current_value: JSON.stringify({ route: "POST /invites" }),
  });
  store.upsertContract({
    id: "deps.db-driver",
    name: "deps.db-driver",
    type: "dep_version",
    current_version: 2,
    current_value: JSON.stringify({ dep: "db-driver", version: "2.0.0" }),
  });

  // ledger #110 + #111 only (explicit ids; next auto id becomes 112).
  store.addLedger({
    id: 110,
    ts: "2026-06-13T13:18:00Z",
    author: "ben",
    description: "invites API returns 202 + job id",
    contract_id: "api.POST /invites",
  });
  store.addLedger({
    id: 111,
    ts: "2026-06-13T13:41:00Z",
    author: "chen",
    description: "adopt zod for DTO parsing",
  });

  // the three sessions (schema §9 claims — the intersection fixture). Team
  // acme/workspaces -> workspace_id github.com/acme/workspaces (§10).
  const WORKSPACE = "github.com/acme/workspaces";
  const sessions: Session[] = [
    {
      id: "sess-asha",
      human: "asha",
      email: "asha@acme.dev",
      branch: "asha/schema",
      workspace_id: WORKSPACE,
      claim_files: ["migrations/**", "schema.sql"],
      claim_symbols: ["users.email", "users.contact_email"],
      last_synced_version: 7,
      status: "live",
    },
    {
      id: "sess-ben",
      human: "ben",
      email: "ben@acme.dev",
      branch: "ben/api",
      workspace_id: WORKSPACE,
      claim_files: ["routes/users.ts"],
      claim_symbols: ["user.email", ".email"],
      last_synced_version: 7,
      status: "live",
    },
    {
      id: "sess-chen",
      human: "chen",
      email: "chen@acme.dev",
      branch: "chen/ui",
      workspace_id: WORKSPACE,
      claim_files: ["UserCard.tsx"],
      claim_symbols: ["user.email", "UserDTO.email"],
      last_synced_version: 7,
      status: "live",
    },
  ];
  for (const s of sessions) store.upsertSession(s);
  // the bus adopts the team's workspace from the seed (§10).
  store.adoptWorkspace(WORKSPACE);
}

// asha's hero migration edit (schema §9): users.email -> contact_email, 0042.
export const ASHA_MIGRATION_BEFORE: string | null = null;
export const ASHA_MIGRATION_AFTER = `-- migration 0042: rename users.email
ALTER TABLE users RENAME COLUMN email TO contact_email;
`;
export const ASHA_WHY = "phone signups make email the wrong name.";
