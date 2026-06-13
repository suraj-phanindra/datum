// datum · Tower sample data — verbatim from the product brief.
// Realistic data over lorem ipsum, everywhere.
window.DATUM = {
  workspace: "acme/workspaces",
  feature: "workspace invites",

  epoch: [
    { v: "v5", time: "11:20", state: "past" },
    { v: "v6", time: "12:08", state: "past" },
    { v: "v7", time: "12:55", state: "past" },
    { v: "v8", time: "14:02", state: "live" },
  ],

  sessions: [
    { initials: "as", name: "asha", scope: "data layer", branch: "asha/schema", active: true },
    { initials: "be", name: "ben", scope: "api", branch: "ben/api", active: true },
    { initials: "ch", name: "chen", scope: "frontend", branch: "chen/ui", active: true },
  ],

  contracts: [
    { name: "db.users", version: "v8", live: true, drift: true, sessions: ["as", "be"],
      history: [
        { v: "v8", time: "14:02", who: "asha", why: "rename users.email → contact_email (phone signups)" },
        { v: "v7", time: "12:55", who: "asha", why: "add users.last_seen_at" },
        { v: "v6", time: "12:08", who: "asha", why: "index on users.team_id" },
      ] },
    { name: "api.GET /users/:id", version: "v3", sessions: ["be", "ch"],
      history: [
        { v: "v3", time: "13:02", who: "ben", why: "UserDTO drops password_hash" },
        { v: "v2", time: "11:40", who: "ben", why: "add UserDTO.last_seen_at" },
      ] },
    { name: "api.POST /invites", version: "v1", sessions: ["be"],
      history: [{ v: "v1", time: "13:18", who: "ben", why: "returns 202 + job id" }] },
    { name: "deps.db-driver", version: "v2", sessions: ["as"],
      history: [{ v: "v2", time: "10:30", who: "asha", why: "bump pg 8.11 → 8.12" }] },
  ],

  drift: {
    contract: "db.users", from: "v7", to: "v8", timestamp: "14:02:11", severity: "red",
    lifecycle: [
      { stage: "detected", elapsed: "0.3s" },
      { stage: "fenced", elapsed: "5.8s" },
      { stage: "advised", elapsed: "6.4s" },
      { stage: "reconciled", elapsed: "2/2", current: true },
    ],
    quote: { who: "asha", text: "phone signups make email the wrong name." },
    change: { from: "users.email", to: "contact_email", migration: "migration 0042" },
    nodes: [
      { initials: "be", label: "routes/users.ts", status: "reconciled" },
      { initials: "ch", label: "UserCard.tsx", status: "reconciled" },
    ],
    advisories: [
      { to: "ben", file: "routes/users.ts",
        text: "users.email is now contact_email (migration 0042, asha). Your open diff selects .email in two queries; update both before your next write." },
      { to: "chen", file: "UserCard.tsx",
        text: "UserDTO.email renamed; regenerate types from the API client. UserCard.tsx line 18 reads user.email and will break at runtime." },
    ],
  },

  // the money shot: the incident mid-flight, the moment the migration lands —
  // detected+fenced complete, advised in progress, reconciled not yet reached.
  driftMid: {
    contract: "db.users", from: "v7", to: "v8", timestamp: "14:02:07", severity: "red",
    lifecycle: [
      { stage: "detected", elapsed: "0.3s" },
      { stage: "fenced", elapsed: "5.8s" },
      { stage: "advised", elapsed: "live", current: true },
      { stage: "reconciled", pending: true },
    ],
    quote: { who: "asha", text: "phone signups make email the wrong name." },
    change: { from: "users.email", to: "contact_email", migration: "migration 0042" },
    nodes: [
      { initials: "be", label: "routes/users.ts", status: "fenced" },
      { initials: "ch", label: "UserCard.tsx", status: "advised" },
    ],
    advisories: [
      { to: "ben", file: "routes/users.ts",
        text: "your write touches users.email, renamed to contact_email 5.8s ago (migration 0042, asha). it's fenced until you re-baseline — pull v8 and re-run your diff." },
      { to: "chen", file: "UserCard.tsx",
        text: "UserDTO.email renamed; regenerate types from the API client. UserCard.tsx line 18 reads user.email and will break at runtime." },
    ],
  },

  ledger: [
    { id: 112, time: "14:02", who: "asha", summary: "rename users.email", tail: "phone signups landing", contract: "db.users" },
    { id: 111, time: "13:41", who: "chen", summary: "adopt zod for DTO parsing" },
    { id: 110, time: "13:18", who: "ben", summary: "invites API returns 202 + job id" },
    { id: 109, time: "12:55", who: "asha", summary: "add users.last_seen_at" },
    { id: 108, time: "12:08", who: "asha", summary: "index on users.team_id" },
  ],

  fleet: { deltas: 4, fenced: 3, deltaToFence: "5.8s", reworkAvoided: "~412k tokens", agents: 3, lastDelta: "4m ago" },
};
