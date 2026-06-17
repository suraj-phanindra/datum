## headless datum demo + workspace-invites seed + emitter

### Visible behavior
Scenario: a terminal. `datum demo` boots the bus, seeds the `acme/workspaces` "workspace invites" repo at registry epoch **7** (`db.users` v7, `users.email`), and drives three sessions (asha/schema, ben/api, chen/ui). The emitter fires the verbatim lifecycle on honest timings: asha's `migrations/0042_*.sql` rename `users.email→contact_email` is **detected at 0.3s** (epoch ticks 7→8), **ben's write to `routes/users.ts` is fenced at 5.8s**, **two advisories deliver at 6.4s**, both consumers **reconcile by 14:03:40**, **spec PR #14 opens at 14:04**. The runner prints a green checklist of the six conditions and exits **0**. Crucially it runs with the **web tower stopped**: the fence, advisory inject, and spec PR all happen on the terminal path (not-a-dashboard).

### Interface / contract
The seed posts asha's edit through `POST /events` (`edit.streamed`); the server's `classifyEdit` returns `{contractRelevant:true, contractType:"db_schema", contractId:"db.users", mechanicalChange:{kind:"rename_column", table:"users", from:"email", to:"contact_email", migration:"0042"}}` and `bumpRegistry` advances the epoch to 8, emitting `delta.detected`. Ben's fence is `decideFence` returning `{decision:"deny", reason:…}` naming `db.users`, `email→contact_email`, `asha`. The emitter replays `delta.detected`, `write.fenced`, `advisory.delivered` (two `Advisory` objects, schema §6: ben `routes/users.ts` severity `fence`, chen `UserCard.tsx` severity `advisory`, `ben.body !== chen.body`), `reconciled` (per session) ×2, workspace `reconciled`, and `spec.pr.opened` (`pr_number:14`, `patch_path:"docs/spec.md"`, `ledger_id:112`). The runner reads truth via `GET /version` (expects `{registry_version:8}`) and `GET /sessions/:id/advisories`.

### Acceptance test
`demo/datum-demo.ts` is the verifier itself; `test/demo-runner.test.ts` asserts its exit semantics. The acceptance check: `datum demo` runs the workspace-invites scenario headless and asserts, exiting 0 only if all hold: registry advances to v8, exactly one write is fenced, two advisories are delivered, the two advisories differ, one spec PR is opened, three branches merge clean. Test asserts exit code 0 on the happy path, the six predicates individually, and exit ≠ 0 when any one is forced to fail. A second case runs with the tower process down and asserts the same exit 0 (not-a-dashboard).

### Files it touches
`demo/datum-demo.ts`, `demo/emitter.ts`, `demo/scenario.ts`, `demo/seed.ts`, `demo/workspace-invites/**` (schema.sql, migrations/0042_rename_users_email.sql, routes/users.ts, UserCard.tsx, docs/spec.md, three branches), `test/demo-runner.test.ts`. Imports `server/fence.ts`'s `decideFence` and `server/watchlist.ts`'s `classifyEdit`/`bumpRegistry` (does not redefine them).

### Open questions / risks
- Sequencing: depends on all core tracks. Until arbiter/spec-pr land, the emitter must stub `advisory.delivered`/`spec.pr.opened` from seeded §6 data **behind a strict flag** so the runner is testable early (the stub is never the only proof).
- Whether `datum demo` should boot its own ephemeral bus or attach to a running one; default to **ephemeral** for reproducibility.

---
### Reconciliation (binding)
- **"Three branches merge clean" is a COMMITTED predicate, not an open question.** `datum demo` performs a real `git merge` of `asha/schema`, `ben/api`, `chen/ui` onto `contact_email` in `demo/workspace-invites/` and asserts no conflict + exit 0. The three branches are a real fixture in the seed.
- **Sole owner of `demo/scenario.ts`** (self-correction contributes the ben two-step as a defined section).
- **The advisory/PR stub is flag-isolated test scaffold only.** The real arbiter and real spec-pr are exercised by their own acceptance runs. `reconciled` in the live run comes from the server (bus-registry), not the emitter.
