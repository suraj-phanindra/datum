export const meta = {
  name: 'datum-build-4-mcp-demo-stopguard',
  description: 'Parallel build of MCP server (#6), the headless datum demo + seed (#9, the RUBRIC gate), and the Stop guard (#12), each implement then adversarially verify',
  phases: [
    { title: 'Implement', detail: 'mcp + demo-runner + stop-guard in parallel, each runs only its own test(s)' },
    { title: 'Verify', detail: 'per-track fresh-eyes verifier; demo-runner verifier runs `datum demo` end to end' },
  ],
}

const IMPL_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['track', 'summary', 'files_written', 'own_tests_passed', 'test_output_tail'],
  properties: {
    track: { type: 'string' }, summary: { type: 'string' },
    files_written: { type: 'array', items: { type: 'string' } },
    own_tests_passed: { type: 'boolean' }, test_output_tail: { type: 'string' },
    demo_exit_code: { type: 'string', description: 'demo-runner only: the exit code of `node demo/datum-demo.ts`' }, notes: { type: 'string' },
  },
}
const VERIFY_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['track', 'verdict', 'own_tests_passed', 'rubric_checks', 'issues', 'summary'],
  properties: {
    track: { type: 'string' }, verdict: { type: 'string', enum: ['pass', 'fail'] }, own_tests_passed: { type: 'boolean' },
    rubric_checks: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['item', 'pass', 'evidence'], properties: { item: { type: 'string' }, pass: { type: 'boolean' }, evidence: { type: 'string' } } } },
    issues: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['severity', 'detail'], properties: { severity: { type: 'string' }, detail: { type: 'string' }, file: { type: 'string' } } } },
    summary: { type: 'string' },
  },
}

const COMMON = `SHARED RULES:
- Zero install: Node built-ins ONLY (node:sqlite, node:http, node:test, node:child_process, fetch). NO npm install, NO new dependency, do NOT touch package.json/tsconfig/.gitignore. No jsdom.
- Native TS + ESM; relative imports use explicit .ts extensions. No build step. Run ONLY your own test file(s) to green (lead runs full suite at integration).
- The whole substrate + tracks are built and committed: server/{db,store,watchlist,registry,reconcile,bus,index,seed}.ts, server/fence.ts (decideFence), server/arbiter/{intersect,prompt,advise,index}.ts (runArbiter + advise + intersectingSessions), server/arbiter/spec-pr.ts (openSpecPR), hooks/datum-{fence,join,claim}.ts, cli/{datum,init}.ts (init + mergeSettingsBlock + datumSettingsBlock), web/*. READ what you need and IMPORT; do NOT edit files outside your ownership.
- Useful exports: server/index.ts -> startBus({port,dbPath}); server/seed.ts -> seedScenario(store), ASHA_MIGRATION_AFTER, ASHA_WHY; server/registry.ts -> applyEdit, intersectingSessions; server/fence.ts -> decideFence; server/arbiter/index.ts -> runArbiter(store, delta, {modelClient?}); server/arbiter/spec-pr.ts -> openSpecPR(delta, ledgerId, {repoDir,specPath,useGh}); server/store.ts -> Store + row types.
- Code against docs/prd/schema.md VERBATIM; honor docs/prd/RECONCILIATION.md (binding). not-a-dashboard: the demo + guard work with the web app stopped; the fence/guard keep the model off the critical path. Read your PRD first.`

const TRACKS = [
  {
    key: 'mcp-server', title: 'MCP server (registry tools)', prd: 'docs/prd/mcp-server.md', testcmd: 'node --test test/mcp.test.ts',
    build: `Create server/mcp.ts and test/mcp.test.ts. (cli/init.ts already registers mcpServers.datum -> node server/mcp.ts via a stdio command; you only build the server. Do NOT edit cli/init.ts.)
- server/mcp.ts: a STDIO MCP server (newline-delimited JSON-RPC 2.0 over stdin/stdout — NO sdk, hand-roll the minimal loop: handle "initialize" -> {protocolVersion, capabilities:{tools:{}}, serverInfo}; "tools/list" -> the 4 tool schemas; "tools/call" -> dispatch). Export the 4 tool HANDLERS as plain async functions too (so they are unit-testable without the stdio loop): datum_registry_snapshot() -> GET {bus}/registry; datum_deltas_since(version) -> GET {bus}/deltas?since=version; datum_decide(description, contract?) -> POST {bus}/decide {author from .datum/state.json, description, contract?}; datum_my_advisories() -> GET {bus}/sessions/:id/advisories (session id from .datum/state.json). bus url from .datum/state.json.bus_url ?? DATUM_BUS_URL ?? http://127.0.0.1:4317. The server never calls the model. Fail open: bus unreachable -> tool returns a structured {warning} (MCP tool result with isError or a text warning), never crash.
- test/mcp.test.ts (node --test test/mcp.test.ts): startBus ephemeral + seedScenario + applyEdit asha's migration so epoch===8. Set DATUM_BUS_URL to it. Assert handlers: datum_registry_snapshot() -> registry_version 8 with a db.users contract at current_version 8; datum_deltas_since(7) -> exactly the one rename_column delta (mechanical_change.from email, to contact_email, author asha); datum_deltas_since(8) -> []; datum_decide("note") -> a numeric ledger_id and an UNCHANGED registry_version (epoch-neutral). Plus a minimal stdio smoke: spawn node server/mcp.ts, send an "initialize" then a tools/list JSON-RPC line, assert a well-formed JSON-RPC result listing the 4 tools. Clean up.`,
  },
  {
    key: 'demo-runner', title: 'headless datum demo + workspace-invites seed + emitter', prd: 'docs/prd/demo-runner.md', testcmd: 'node --test test/demo-runner.test.ts && node demo/datum-demo.ts; echo EXIT=$?',
    build: `THE RUBRIC GATE. Create demo/seed.ts, demo/scenario.ts, demo/emitter.ts, demo/datum-demo.ts, demo/workspace-invites/** (a real git repo), and test/demo-runner.test.ts. You are SOLE owner of demo/*.
- demo/workspace-invites/: a REAL git repo (use node:child_process git). On 'main' (or a base): schema.sql with a users table having an 'email' column (v7 truth), routes/users.ts that selects user.email, UserCard.tsx that reads user.email, docs/spec.md describing users.email, migrations/ dir. Then THREE branches that all reconcile onto contact_email so they MERGE CLEAN (disjoint files): asha/schema (adds migrations/0042_rename_users_email.sql with ASHA_MIGRATION_AFTER content + rewrites schema.sql email->contact_email), ben/api (rewrites routes/users.ts email->contact_email), chen/ui (rewrites UserCard.tsx email->contact_email). The migration file MUST begin with a comment line carrying asha's rationale ("-- phone signups make email the wrong name") so the live why is honest. demo/seed.ts builds this repo idempotently (rm + recreate) and returns its path + branch names.
- demo/scenario.ts: the ordered scenario steps (asha migrates -> epoch 8; ben attempts routes/users.ts .email write -> FENCED; ben self-corrects to contact_email -> reconciled; chen advised -> reconciles). Structure it so feature #10 (self-correction) can later refine ben's two-step. Export the step list + a runScenario(store, bus) helper.
- demo/emitter.ts: a scripted event emitter that replays the lifecycle on a compressed (~8s) or instant timeline for the tower/video — fires the exact §3 events with honest §9 elapsed-time LABELS (detected 0.3s, fenced 5.8s, advised 6.4s, reconciled by 14:03:40, PR #14 14:04). This is the video/replay source; it is NOT the only source of reconciled (the live server emits that).
- demo/datum-demo.ts: the HEADLESS runner (runnable: node demo/datum-demo.ts; cli 'datum demo' already delegates here). Boots an ephemeral in-process bus (startBus) + seedScenario(store) at epoch 7; runs the scenario on the REAL deterministic path: POST asha's migration edit -> applyEdit bumps to 8 + delta.detected; run decideFence for ben's .email write -> DENY -> emit exactly one write.fenced; ben's corrected contact_email write -> decideFence allow -> server reconciled; chen reconciles; run the arbiter (runArbiter with the DEFAULT real Opus modelClient; on any model error fall back to a deterministic fixture pair so the gate still exits 0, and LOG which path ran) -> two advisory.delivered that DIFFER + name each recipient's file; run openSpecPR(delta, ledgerId=112, {repoDir: the seed repo, useGh:false}) -> one spec.pr.opened #14 patching docs/spec.md; finally do a REAL git merge of asha/schema, ben/api, chen/ui into a fresh integration branch and assert no conflict. Then assert the SIX predicates and print a green checklist; process.exit(0) only if ALL hold, else exit 1 with which failed. It must NOT start the web tower (not-a-dashboard). Make it idempotent (re-runnable).
- test/demo-runner.test.ts (node --test test/demo-runner.test.ts): spawn 'node demo/datum-demo.ts' and assert exit code 0; assert each of the six predicates is reported true; then a negative case: force one predicate to fail (e.g. via an env flag your runner honors like DATUM_DEMO_BREAK=fence) and assert exit !== 0. Also assert the not-a-dashboard line (no tower process). Keep runs ephemeral + isolated.
- ALSO run \`node demo/datum-demo.ts\` yourself and confirm EXIT=0; put the exit code in demo_exit_code.`,
  },
  {
    key: 'stop-guard', title: 'Stop guard hook (stretch, P3)', prd: 'docs/prd/stop-guard.md', testcmd: 'node --test test/stop-guard.test.ts',
    build: `Create hooks/datum-guard.ts and test/stop-guard.test.ts, and add a Stop entry to datumSettingsBlock in cli/init.ts (this is the ONLY edit to a non-owned file; init.ts is committed so there is no parallel race — add a single Stop -> datum-guard.ts exec-form entry to the existing block, idempotent via the existing helper; keep all other entries intact).
- hooks/datum-guard.ts (Stop hook, runnable via node): read Stop JSON from stdin (session_id, cwd). Load .datum/state.json (last_synced_version, claim_files, claim_symbols, bus_url). GET {bus}/version; if last_synced_version === registry_version -> ALLOW the stop (exit 0, no /deltas — cache-hit fast path). Else GET {bus}/deltas?since=N and call decideFence per delta, passing the session's accumulated diff (union of claim_symbols + recent edit.streamed summaries from GET {bus}/... or just the claim) as write.content. If any delta yields deny/inject (an unacknowledged intersecting delta) -> BLOCK the stop: exit 2 with stderr reason naming contract + change + author (or print {"decision":"block","reason":...}). Else ALLOW (exit 0). Emit NO bus event (block locally only — must NOT reuse write.fenced, which would corrupt 'exactly one write fenced'). FAIL OPEN: bus unreachable within ~1s -> ALLOW + append .datum/warnings.log. Never throw; .finally exit.
- test/stop-guard.test.ts (node --test test/stop-guard.test.ts): (1) session behind one epoch with claim_symbols incl 'user.email'/'.email' + the seeded db.users v7->v8 delta -> guard BLOCKS (exit 2 or decision block), reason names db.users + email->contact_email + asha; (2) last_synced===registry_version -> ALLOW, and assert no /deltas fetch happened (cache-hit fast path); (3) diff already using contact_email (claim_symbols swapped) -> ALLOW; (4) bus down (unreachable url) -> ALLOW (fail-open) + a warning line logged. Use an ephemeral seeded bus where needed; spawn the hook with async spawn (not spawnSync — spawnSync deadlocks the in-process bus).`,
  },
]

function implPrompt(t) {
  return `${COMMON}\n\nYOUR TRACK: ${t.title} (key: ${t.key}). PRD: ${t.prd}.\n\n${t.build}\n\nWhen your own tests are green (and for demo-runner, \`node demo/datum-demo.ts\` exits 0), return the structured result (track="${t.key}"). Do not over-explain.`
}
function verifyPrompt(t) {
  const demoExtra = t.key === 'demo-runner'
    ? ` CRITICAL: run \`node demo/datum-demo.ts\` YOURSELF and confirm exit code 0; independently confirm EACH of the six predicates (registry advances to v8; EXACTLY ONE write fenced; two advisories delivered; the two advisories DIFFER; one spec PR opened; three branches merge clean via a real git merge). Confirm it runs WITHOUT starting the web tower (not-a-dashboard). Confirm the negative path (a forced break) exits non-zero. Confirm advisories are real-Opus-by-default with a deterministic fallback, and the scenario keeps honest elapsed-time labels.`
    : ''
  return `You are an INDEPENDENT VERIFIER (fresh eyes) for the Datum track "${t.key}" — ${t.title}. Do not trust the implementer.\nREAD: ${t.prd} (acceptance), docs/prd/schema.md, docs/prd/RECONCILIATION.md, then the REAL code.\nDO: run \`${t.testcmd}\` yourself; grade each RUBRIC item the PRD claims against real code + output; flag schema drift, stubs-where-real-logic-required, tests that don't assert what they claim.${demoExtra} Track-specifics: (mcp-server) confirm 4 tools proxy the bus, datum_decide is epoch-neutral, fail-open, and a stdio JSON-RPC smoke works; (stop-guard) confirm it blocks locally with NO write.fenced event, cache-hit fast path, fail-open, and only added a single idempotent Stop entry to init.ts. Set verdict 'pass' ONLY if tests green AND all hold on real code; else 'fail' with specific issues. Return structured findings (track="${t.key}").`
}

const results = await pipeline(
  TRACKS,
  (t) => agent(implPrompt(t), { label: `impl:${t.key}`, phase: 'Implement', agentType: 'general-purpose', schema: IMPL_SCHEMA }),
  (impl, t) => agent(verifyPrompt(t), { label: `verify:${t.key}`, phase: 'Verify', agentType: 'general-purpose', schema: VERIFY_SCHEMA })
    .then((verdict) => ({ track: t.key, impl, verdict })),
)
return results
