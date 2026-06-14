export const meta = {
  name: 'datum-build-5-selfcorrect-deploy',
  description: 'Build self-correction test (#10) and the deploy static-v8 artifact + local test (#11), each implement then adversarially verify',
  phases: [
    { title: 'Implement', detail: 'self-correction test + deploy artifact in parallel' },
    { title: 'Verify', detail: 'per-track fresh-eyes verifier' },
  ],
}
const IMPL_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['track', 'summary', 'files_written', 'own_tests_passed', 'test_output_tail'],
  properties: { track: { type: 'string' }, summary: { type: 'string' }, files_written: { type: 'array', items: { type: 'string' } }, own_tests_passed: { type: 'boolean' }, test_output_tail: { type: 'string' }, notes: { type: 'string' } },
}
const VERIFY_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['track', 'verdict', 'own_tests_passed', 'rubric_checks', 'issues', 'summary'],
  properties: { track: { type: 'string' }, verdict: { type: 'string', enum: ['pass', 'fail'] }, own_tests_passed: { type: 'boolean' },
    rubric_checks: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['item', 'pass', 'evidence'], properties: { item: { type: 'string' }, pass: { type: 'boolean' }, evidence: { type: 'string' } } } },
    issues: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['severity', 'detail'], properties: { severity: { type: 'string' }, detail: { type: 'string' }, file: { type: 'string' } } } },
    summary: { type: 'string' } },
}

const COMMON = `SHARED RULES: Zero install (Node built-ins only: node:sqlite, node:http, node:test, node:child_process, fetch); NO npm install/new deps; do not touch package.json/tsconfig. Native TS + ESM, explicit .ts relative imports, no build step. Run ONLY your own test file. The full app is built+committed (server/*, hooks/*, cli/*, web/{serve,index.html,tower.js,tokens-shim.css,drift-card.js,anim.css}, demo/* incl demo/seed.ts + demo/datum-demo.ts). Useful: server/index.ts startBus; server/seed.ts seedScenario/ASHA_MIGRATION_AFTER/ASHA_WHY; server/registry.ts applyEdit; server/fence.ts decideFence; server/store.ts Store. Code against docs/prd/schema.md; honor docs/prd/RECONCILIATION.md. Read your PRD first.`

const TRACKS = [
  {
    key: 'self-correction', title: 'agent self-correction (formal test)', prd: 'docs/prd/self-correction.md', testcmd: 'node --test test/self-correction.test.ts',
    build: `Create test/self-correction.test.ts ONLY (the deny-reason is fence-owned; the scenario two-step already lives in demo-runner's demo/scenario.ts — reference it, do not fork). Formalize RUBRIC "A fenced agent reads the reason and self-corrects on its next action with no human input":
- (a) decideFence on ben's write to routes/users.ts selecting '.email' (lastSyncedVersion 7, currentVersion 8, deltas=[the users.email->contact_email rename_column Delta]) -> decision 'deny'; reason matches /db\\.users/, /email/, /contact_email/, /asha/ (the agent's self-correction input).
- (b) decideFence on ben's NEXT write using 'contact_email' (same versions/deltas) -> decision 'allow' (the self-corrected write passes; no human input).
- (c) END-TO-END on a real ephemeral bus: startBus + seedScenario (epoch 7); applyEdit asha's migration -> epoch 8; emit a write.fenced for sess-ben (the fence); then POST an edit.streamed for sess-ben on routes/users.ts whose content uses contact_email (the corrected write) -> assert the server emits a per-session 'reconciled' for sess-ben (correlation key session_id+contract_id), and that across the run there is EXACTLY ONE write.fenced followed by a reconciled for sess-ben. No human input is simulated anywhere.`,
  },
  {
    key: 'deploy', title: 'deploy: static v8 artifact + local test', prd: 'docs/prd/deploy.md', testcmd: 'node --test test/deploy.test.ts',
    build: `Create demo/seed-snapshot.ts, web/snapshot.json, web/deploy.config.json, test/deploy.test.ts; and add a snapshot fallback to web/serve.ts + a client fallback to web/tower.js (these two are tower-owned but committed — make MINIMAL, clearly-scoped additions behind a fallback path; do not fork the render path or change existing behavior when a bus IS present).
- demo/seed-snapshot.ts: run an in-memory bus + seedScenario + applyEdit asha's migration to reach epoch 8, run the arbiter (fixture/offline ok) + openSpecPR (local artifact) so the event log contains the full lifecycle; then serialize web/snapshot.json = { registry: <GET /registry response: registry_version 8 + the 4 Contract rows>, deltas: <GET /deltas?since=0>, events: <the frozen replay: delta.detected, write.fenced, advisory.delivered x2, reconciled x2 + workspace, spec.pr.opened #14>, ledger: [#112,#111,#110] }. Deterministic; runnable: node demo/seed-snapshot.ts. Commit the generated web/snapshot.json.
- web/serve.ts: when the live bus is unreachable (or DATUM_SNAPSHOT=1), hydrate window.__DATUM__ from web/snapshot.json instead — so the page renders v8 with NO bus. When a bus IS present, behavior is unchanged.
- web/tower.js: if window.__DATUM__ is absent at load (pure static host, no node server), fetch ./snapshot.json and hydrate from it. Existing live-bus + SSE behavior unchanged.
- web/deploy.config.json: a small config naming the static asset set to publish (index.html, tower.js, drift-card.js, *.css, snapshot.json, any fonts) + intended host placeholder. The deployable artifact is a STATIC bundle (no node server required on the host).
- test/deploy.test.ts: run demo/seed-snapshot.ts (or its exported builder) to (re)generate snapshot.json; assert snapshot.registry.registry_version===8 and a db.users contract at current_version 8 and that the event replay contains all 6 event types through spec.pr.opened #14. Then serve the static web/ dir via a tiny node:http static server (no datum bus running) and assert GET / -> 200 and the page hydrates v8 (either window.__DATUM__ embedded by serve.ts in snapshot mode, OR snapshot.json fetchable + contains registry_version 8). Confirms the not-a-dashboard line: a live URL shows v8 with no bus process.`,
  },
]

function implPrompt(t) { return `${COMMON}\n\nYOUR TRACK: ${t.title} (key: ${t.key}). PRD: ${t.prd}.\n\n${t.build}\n\nWhen your own test is green, return the structured result (track="${t.key}").` }
function verifyPrompt(t) { return `You are an INDEPENDENT VERIFIER (fresh eyes) for "${t.key}" — ${t.title}. Do not trust the implementer.\nREAD ${t.prd}, docs/prd/schema.md, docs/prd/RECONCILIATION.md, then the REAL code. Run \`${t.testcmd}\` yourself; grade the RUBRIC items; flag stubs/drift/weak-assertions. (self-correction) confirm the test proves deny-then-allow + exactly-one-fence-then-reconciled on a real bus with no human input. (deploy) confirm snapshot.json is real v8 with the full event replay through spec.pr.opened #14, the static bundle serves 200 + shows v8 with NO bus running (not-a-dashboard), and the serve.ts/tower.js additions don't break the live-bus path. Set verdict 'pass' only if tests green AND all hold on real code; else 'fail' with specifics. Return structured findings (track="${t.key}").` }

const results = await pipeline(
  TRACKS,
  (t) => agent(implPrompt(t), { label: `impl:${t.key}`, phase: 'Implement', agentType: 'general-purpose', schema: IMPL_SCHEMA }),
  (impl, t) => agent(verifyPrompt(t), { label: `verify:${t.key}`, phase: 'Verify', agentType: 'general-purpose', schema: VERIFY_SCHEMA }).then((verdict) => ({ track: t.key, impl, verdict })),
)
return results
