export const meta = {
  name: 'datum-build-1-bus-registry',
  description: 'Implement the Datum bus+registry substrate (node:sqlite + node:http, zero-install, native TS) then adversarially verify it against the PRD + RUBRIC',
  phases: [
    { title: 'Implement', detail: 'build server/* + tests, iterate to green npm test' },
    { title: 'Verify', detail: 'fresh-eyes verifier runs npm test + grades each RUBRIC item' },
  ],
}

const IMPL_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['summary', 'files_written', 'npm_test_passed', 'test_output_tail'],
  properties: {
    summary: { type: 'string' },
    files_written: { type: 'array', items: { type: 'string' } },
    npm_test_passed: { type: 'boolean' },
    test_output_tail: { type: 'string' },
    notes: { type: 'string' },
  },
}
const VERIFY_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['verdict', 'npm_test_passed', 'rubric_checks', 'issues', 'summary'],
  properties: {
    verdict: { type: 'string', enum: ['pass', 'fail'] },
    npm_test_passed: { type: 'boolean' },
    rubric_checks: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['item', 'pass', 'evidence'], properties: { item: { type: 'string' }, pass: { type: 'boolean' }, evidence: { type: 'string' } } } },
    issues: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['severity', 'detail'], properties: { severity: { type: 'string' }, detail: { type: 'string' }, file: { type: 'string' } } } },
    summary: { type: 'string' },
  },
}

const IMPL = `You are the track-A implementer building the Datum **bus + registry substrate** — the foundation every other track imports. Build it for real, with tests, and iterate until \`npm test\` is green.

READ FIRST (Read tool): docs/prd/bus-registry.md (your PRD), docs/prd/schema.md (the FROZEN contract — §2 tables, §3 events, §4 HTTP API, §5 watchlist), docs/prd/RECONCILIATION.md (binding post-critic resolutions), CLAUDE.md (architecture + not-a-dashboard).

HARD CONSTRAINTS:
- **Zero install.** Use ONLY Node built-ins: \`node:sqlite\` (import { DatabaseSync } from 'node:sqlite' — verified working on this Node 25 with NO flag, synchronous), \`node:http\` for the server + SSE, \`node:test\` + \`node:assert/strict\` for tests. Do NOT run npm install or add any dependency.
- **Native TypeScript, ESM.** Files are .ts; the repo has type:module; \`npm test\` runs \`node --test "test/**/*.test.ts"\`. Relative imports MUST use explicit \`.ts\` extensions (e.g. import { x } from './store.ts') — verified required for Node type-stripping. No build step.
- **Code against schema.md verbatim** — exact type names, field names, endpoints, event-type strings, the ClassifyResult/MechanicalChange/Delta shapes, registry_version vs per-contract version model. snake_case on the wire/events, camelCase for in-process TS objects (schema §5 casing note).

BUILD these files:
- server/db.ts — open a DatabaseSync (path arg; ':memory:' for tests, default .datum/datum.db), create the 5 tables (contracts, contract_versions, ledger, sessions, events) per §2, expose close().
- server/store.ts — typed CRUD: getVersion()/setVersion(epoch); upsertContract/getContract/listContracts; addContractVersion; addLedger(entry)->id (supports explicit ids for seeding #110/#111); upsertSession/getSession/listSessions/patchSession (advance last_synced_version, claim); addEvent(type,payload)->Event; getEventsSince(id); getDeltasSince(version). All synchronous.
- server/watchlist.ts — classifyEdit(path, before, after): ClassifyResult (§5 globs + a REAL light parse for the rename_column hero on migrations/*.sql and schema.sql; other kinds light); bumpRegistry(currentEpoch, delta): currentEpoch+1 (monotonic, only contractRelevant); referencesStaleSymbol(content, mechanicalChange): boolean (word-boundary match so 'contact_email' is NOT matched by 'email'). NOTE: fence (track B) will import referencesStaleSymbol; keep it pure + exported.
- server/registry.ts — applyEdit(streamedEvent): runs classifyEdit; if contractRelevant -> bumpRegistry, addContractVersion, addLedger (the delta's 'why' becomes ledger #112 for asha's rename; seed loads #110/#111 only), emit 'delta.detected'; returns { registry_version, delta? }. intersectingSessions(delta, sessions): deterministic set whose claim_files/claim_symbols touch the delta (author excluded) — NOTE: arbiter (track C) will import this.
- server/reconcile.ts — track fenced sessions; on an 'edit.streamed' from a previously-fenced session whose content NO LONGER references the stale symbol (referencesStaleSymbol false) for the same contract, emit per-session 'reconciled' { session_id, human, contract_id, epoch, path }; when ALL intersecting consumers have reconciled, emit workspace 'reconciled' { workspace:true, epoch, sessions:[] }. Correlation key = session_id + contract_id (NOT path).
- server/bus.ts — node:http server exposing EVERY §4 endpoint: GET /version, GET /version/wait?since=N&timeout=ms (long-poll), GET /registry, GET /deltas?since=N, POST /sessions, PATCH /sessions/:id (returns { ok, registry_version }), POST /events (runs registry.applyEdit + reconcile, returns { ok, registry_version, delta? }), GET /sessions/:id/advisories, POST /decide (EPOCH-NEUTRAL: append ledger, return CURRENT registry_version unchanged), GET /stream (SSE of Event), GET /healthz. JSON in/out. The server appends every posted event and broadcasts to SSE subscribers.
- server/index.ts — export startBus({ port, dbPath }): starts the server, returns { url, close() }; default port from DATUM_BUS_URL or 4317. Runnable via \`node server/index.ts\`.
- TESTS (all green): test/watchlist.test.ts (classifyEdit: migrations/0042_rename.sql -> contractRelevant true, contractId 'db.users', mechanicalChange.kind 'rename_column' from 'email' to 'contact_email'; README.md -> false; referencesStaleSymbol('select .email', change) true, '...contact_email' false), test/version-bump.test.ts (bumpRegistry(7,delta)===8; off-watchlist no bump), test/reconcile.test.ts (per-session + workspace reconciled emission on a clean write), test/bus.test.ts (INTEGRATION: startBus on an ephemeral port; GET /healthz ok; seed db.users v7 at epoch 7; POST /events for asha's migration edit -> { registry_version:8, delta } + a delta.detected event present; GET /version -> 8; POST /events for a README edit -> version still 8; POST /decide -> ledger_id returned + version unchanged; close()).

PROCESS: build, then run \`npm test\` and FIX until it is fully green. Use ephemeral ports + ':memory:' in tests so they are isolated and parallel-safe. Keep the model OFF this path — no Anthropic calls anywhere in the substrate. When green, return the structured result (do not over-explain).`

phase('Implement')
const impl = await agent(IMPL, { label: 'impl:bus-registry', phase: 'Implement', agentType: 'general-purpose', schema: IMPL_SCHEMA })

phase('Verify')
const VERIFY = `You are an INDEPENDENT VERIFIER with fresh eyes. The track-A implementer just built the Datum bus+registry substrate. Verify it for real — do not trust their summary.

READ: docs/prd/bus-registry.md (acceptance test section), docs/prd/schema.md (§2-§5), docs/prd/RECONCILIATION.md. Then READ the actual code in server/ and test/.

DO:
1. Run \`npm test\` yourself (Bash) and report whether it is fully green (capture the tail).
2. Grade each of these RUBRIC items against the REAL code + test output (not assumptions):
   - "an edit on a contract surface bumps the monotonic registry version; an edit off the watchlist does not" (classifyEdit + bumpRegistry + test/watchlist + test/version-bump).
   - "registry advances to v8" (POST /events on asha's migration -> registry_version 8; test/bus).
   - The reconciliation requirements: server-OWNED 'reconciled' emission (per-session + workspace) exists in server/reconcile.ts and is tested; POST /decide is epoch-NEUTRAL; ledger #112 is created on delta detection (seed loads #110/#111 only); PATCH /sessions/:id advances last_synced_version; referencesStaleSymbol + intersectingSessions are exported for fence/arbiter to import.
   - Zero-install + node:sqlite + node:http + native .ts (no added deps in package.json, no npm install needed).
   - Every §4 endpoint exists.
3. Flag any schema drift (wrong field/event names, casing, missing endpoint), any stub/fake where real logic is required, and any test that does not actually assert the behavior it claims.

Set verdict 'pass' ONLY if npm test is green AND all the above hold on the real code. Otherwise 'fail' with specific, actionable issues. Return structured findings only.`

const verdict = await agent(VERIFY, { label: 'verify:bus-registry', phase: 'Verify', agentType: 'general-purpose', schema: VERIFY_SCHEMA })

return { impl, verdict }
