// demo/live-bus.ts — a long-running, seeded bus for the live 3-session run.
// Seeds the workspace-invites scenario at v7, applies asha's migration to bump to
// v8, then stays alive so real `claude -p` sessions (with datum hooks installed)
// can be fenced against the current truth. Run: PORT=4319 node demo/live-bus.ts
import { rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { startBus } from "../server/index.ts";
import { openDb } from "../server/db.ts";
import { Store } from "../server/store.ts";
import { seedScenario, ASHA_MIGRATION_AFTER } from "../server/seed.ts";

const port = Number(process.env.PORT || 4319);
const dbPath = join(tmpdir(), `datum-live-${port}.db`);
rmSync(dbPath, { force: true });

// seed v7 into the db file, then start the bus on it.
const db = openDb(dbPath);
seedScenario(new Store(db));
db.close();

const bus = await startBus({ port, dbPath });

// apply asha's migration -> registry v8 (db.users.email -> contact_email).
await fetch(`${bus.url}/events`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    type: "edit.streamed",
    payload: {
      session_id: "sess-asha",
      human: "asha",
      tool_name: "Write",
      path: "migrations/0042_rename_users_email.sql",
      after: ASHA_MIGRATION_AFTER,
      why: "phone signups make email the wrong name",
      ts: "2026-06-13T14:02:11Z",
    },
  }),
});

const v = await (await fetch(`${bus.url}/version`)).json();
console.log(`live bus up at ${bus.url} · registry v${v.registry_version}`);
console.log("(leave running; Ctrl-C to stop)");
