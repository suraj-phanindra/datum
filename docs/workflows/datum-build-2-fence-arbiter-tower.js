export const meta = {
  name: 'datum-build-2-fence-arbiter-tower',
  description: 'Parallel build of fence (#2), arbiter (#4), tower (#7) against the bus+registry substrate, each implement then adversarially verify',
  phases: [
    { title: 'Implement', detail: 'fence + arbiter + tower in parallel, each runs only its own test file' },
    { title: 'Verify', detail: 'per-track fresh-eyes verifier grades PRD + RUBRIC' },
  ],
}

const IMPL_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['track', 'summary', 'files_written', 'own_tests_passed', 'test_output_tail'],
  properties: {
    track: { type: 'string' },
    summary: { type: 'string' },
    files_written: { type: 'array', items: { type: 'string' } },
    own_tests_passed: { type: 'boolean' },
    test_output_tail: { type: 'string' },
    live_proof: { type: 'string', description: 'for arbiter: the two real advisory bodies from a live Opus call, else empty' },
    notes: { type: 'string' },
  },
}
const VERIFY_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['track', 'verdict', 'own_tests_passed', 'rubric_checks', 'issues', 'summary'],
  properties: {
    track: { type: 'string' },
    verdict: { type: 'string', enum: ['pass', 'fail'] },
    own_tests_passed: { type: 'boolean' },
    rubric_checks: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['item', 'pass', 'evidence'], properties: { item: { type: 'string' }, pass: { type: 'boolean' }, evidence: { type: 'string' } } } },
    issues: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['severity', 'detail'], properties: { severity: { type: 'string' }, detail: { type: 'string' }, file: { type: 'string' } } } },
    summary: { type: 'string' },
  },
}

const COMMON = `SHARED RULES (all tracks):
- Zero install: Node built-ins ONLY (node:sqlite, node:http, node:test, fetch). No npm install, no new dependency, do not touch package.json/tsconfig/.gitignore.
- Native TS + ESM; relative imports use explicit .ts extensions. No build step.
- The bus+registry substrate is ALREADY BUILT in server/ — READ it and IMPORT from it; do NOT edit existing server/* files. Exports you will use: server/watchlist.ts -> classifyEdit, bumpRegistry, referencesStaleSymbol; server/registry.ts -> applyEdit, intersectingSessions; server/index.ts -> startBus({port,dbPath}); server/seed.ts -> the workspace-invites seed; server/store.ts -> the §2 row types + CRUD.
- Code against docs/prd/schema.md VERBATIM (types, fields, endpoints, event strings; snake_case wire / camelCase in-process). Honor docs/prd/RECONCILIATION.md (binding) and the not-a-dashboard discipline (the fence/arbiter must work with the web app stopped; keep the model OFF the fence path).
- ONLY create your own files (below). Run ONLY your own test file with \`node --test <file>\` and iterate to green (the lead runs the full suite at integration). Read your PRD first.`

const TRACKS = [
  {
    key: 'fence', title: 'the deterministic fence (decideFence + PreToolUse hook)', prd: 'docs/prd/fence.md', testfile: 'test/fence.test.ts',
    build: `Create server/fence.ts, hooks/datum-fence.ts, test/fence.test.ts.
- server/fence.ts: export \`decideFence(input: FenceInput): FenceDecision\` (schema §7). Import \`referencesStaleSymbol\` from './watchlist.ts'. Logic: if lastSyncedVersion===currentVersion -> {decision:'allow'} WITHOUT consulting deltas (cache-hit fast path); else for each Delta, if referencesStaleSymbol(write.content, delta.mechanical_change) -> {decision:'deny', reason} where reason names the contract_id, the mechanical change ("email -> contact_email"), the migration (0042), the author (asha), and the imperative "Re-sync to v{epoch} and use contact_email"; else if the write.path is within the delta's affected scope but no stale symbol -> {decision:'inject', additionalContext}; else allow. Precedence deny > inject > allow. PURE — no IO, no Date.now() (so the test is deterministic; the hook may prepend a relative time).
- hooks/datum-fence.ts: runnable via \`node hooks/datum-fence.ts\`. Read PreToolUse JSON from stdin (session_id, cwd, tool_name, tool_input). Load .datum/state.json (last_synced_version, bus_url). GET {bus}/version; if behind, GET {bus}/deltas?since=N. Build FenceInput: write.content = tool_input.new_string ?? tool_input.content ?? tool_input.file_text ?? tool_input.command ?? ''; write.path = tool_input.file_path ?? tool_input.path ?? ''. Call decideFence. On deny: print JSON {hookSpecificOutput:{hookEventName:'PreToolUse',permissionDecision:'deny',permissionDecisionReason:reason}} to stdout, exit 0, and POST a write.fenced event to {bus}/events. On inject: print {hookSpecificOutput:{hookEventName:'PreToolUse',permissionDecision:'allow',additionalContext}}. On allow: exit 0 (no output). FAIL OPEN: any bus error or >1s -> allow (exit 0) + append a line to .datum/warnings.log. Never throw.
- test/fence.test.ts (run: node --test test/fence.test.ts): (1) write to routes/users.ts with content selecting '.email', lastSynced 7 / current 8 / deltas=[users.email->contact_email] -> decision 'deny', reason contains 'db.users','email','contact_email','asha'; (2) routes/invites.ts unrelated -> 'allow'; (3) content already 'contact_email' -> 'allow'; (4) lastSynced===current -> 'allow' even if a stale delta is passed (fast path must not deny on a cache hit); (5) HOOK smoke: startBus on an ephemeral port + seed + apply asha's migration (epoch 8), write a .datum/state.json (last_synced 7) in a tmp cwd, spawn \`node hooks/datum-fence.ts\` with a PreToolUse JSON on stdin selecting .email, assert stdout parses to permissionDecision 'deny'. Clean up.`,
  },
  {
    key: 'arbiter', title: 'the arbiter (intersect + Opus 4.8 advisories)', prd: 'docs/prd/arbiter.md', testfile: 'test/advisory-shape.test.ts',
    build: `Create server/arbiter/{index,intersect,advise,prompt}.ts and test/advisory-shape.test.ts.
- server/arbiter/intersect.ts: re-export / wrap intersectingSessions from '../registry.ts' (deterministic recipient set; author excluded). Do not reimplement.
- server/arbiter/prompt.ts: build the per-recipient prompt — a cached/shared prefix (the delta + contract context) plus the recipient's manifest slice (their claim files/symbols + at-risk file). Returns {system, messages} for the Anthropic Messages API.
- server/arbiter/advise.ts: export \`advise(delta, session, modelClient): Promise<Advisory>\` producing an Advisory (schema §6: recipient, session_id, file, delta_ref{contract_id,from_version,to_version,migration,author}, severity 'fence'|'advisory', body, actions[>=1]). modelClient is INJECTABLE; the default client calls claude-opus-4-8 via fetch to https://api.anthropic.com/v1/messages (x-api-key from process.env.ANTHROPIC_API_KEY, anthropic-version 2023-06-01, low temperature), with a fallback that shells out to \`claude -p --model claude-opus-4-8\`. ben -> severity 'fence' (routes/users.ts), chen -> 'advisory' (UserCard.tsx).
- server/arbiter/index.ts: export \`runArbiter(store, delta, {modelClient?})\`: compute intersectingSessions, call advise() per intersecting pair, append one advisory.delivered event per recipient to the store/bus, return the advisories. Async, OFF the critical path; never called by the fence.
- test/advisory-shape.test.ts (run: node --test test/advisory-shape.test.ts): use a FAKE modelClient returning canned distinct prose (so the test is deterministic + offline). Assert: exactly 2 advisories for the hero delta; ben.body !== chen.body; ben.file==='routes/users.ts' & severity 'fence'; chen.file==='UserCard.tsx' & severity 'advisory'; each delta_ref names db.users + email->contact_email + asha; each actions.length>=1. Also assert intersectingSessions excludes asha (author).
- LIVE PROOF (do NOT add to npm test): after the unit test is green, load the real key (\`set -a; . ./.env; set +a\`) and run a one-shot node script that calls advise() for ben and chen with the DEFAULT (real Opus) modelClient against the hero delta; print both real bodies. Confirm they differ and each names the recipient's file. Put the two real bodies in the live_proof field.`,
  },
  {
    key: 'tower', title: 'the web tower (read-only)', prd: 'docs/prd/tower.md', testfile: 'test/tower.test.ts',
    build: `Create web/serve.ts, web/index.html, web/tower.js, web/tokens-shim.css, test/tower.test.ts.
- Lift the layout + markup VERBATIM from docs/datum_tower_drift_state.html (epoch strip, drift card with lifecycle chips + asha quote + mono delta + blast-radius SVG, current-truth registry rail with presence avatars, ledger, fleet footer). Use the design system: read 'datum Design System/readme.md' + 'datum Design System/tokens/colors.css' and copy the needed token CSS into web/ (or @import). Strict color discipline (amber=contract/epoch, red=fence, blue=advisory, green=reconciled, gray ambient).
- web/tokens-shim.css: alias the mockup's --color-* names (e.g. --color-background-danger, --color-text-warning, --color-background-info, --color-text-success, --color-background-primary/secondary, --color-border-secondary/tertiary, --border-radius-lg/md, --font-mono) onto the shipped design-system tokens (--signal-*/--surface-*/--text-*/--radius-*/--font-mono) so the lifted markup renders correctly.
- web/serve.ts: a node:http server. SOLE owner of this file. On GET / it fetches the current snapshot from the bus (GET {DATUM_BUS_URL}/registry + /deltas?since=0) and SERVER-SIDE EMBEDS it into the HTML as \`window.__DATUM__ = {registry_version, contracts, deltas, ledger?}\` so the page shows the truth without JS (and so deploy can bake a static snapshot later). Serves index.html, tower.js, the CSS. Proxies /stream (SSE), /registry, /deltas to the bus so the page can also live-update. Export \`startTower({port, busUrl})\`. Read-only: never POSTs to the bus.
- web/tower.js: hydrate from window.__DATUM__; subscribe to /stream SSE; route events by exact type to update the epoch strip + registry rail + ledger + footer (the live drift-card ANIMATION state machine is a SEPARATE later task #8 — for now render the static drift card from the snapshot, but structure tower.js so #8 can attach to the same SSE router).
- test/tower.test.ts (run: node --test test/tower.test.ts): startBus on an ephemeral port + seed + applyEdit asha's migration so epoch===8; startTower pointing at it; GET / -> HTTP 200 and the returned HTML contains '"registry_version":8' and a db.users entry with '"current_version":8' (the server-side-embedded snapshot — this is the real "shows v8" assertion). Then assert the NOT-A-DASHBOARD line: stop the tower and confirm the bus still answers GET /version with 8. Clean up both servers.`,
    refs: 'docs/datum-design-context.md, docs/datum_tower_drift_state.html, the "datum Design System/" folder (readme.md + tokens/colors.css + styles.css)',
  },
]

function implPrompt(t) {
  return `${COMMON}

YOUR TRACK: ${t.title} (key: ${t.key}). PRD: ${t.prd}${t.refs ? `. Design refs: ${t.refs}` : ''}.

${t.build}

When your own test file is green, return the structured result (track="${t.key}"). Do not over-explain.`
}
function verifyPrompt(t) {
  return `You are an INDEPENDENT VERIFIER (fresh eyes) for the Datum track "${t.key}" — ${t.title}. Do not trust the implementer's summary.
READ: ${t.prd} (acceptance section), docs/prd/schema.md, docs/prd/RECONCILIATION.md, then the REAL code the implementer wrote.
DO: run \`node --test ${t.testfile}\` yourself; grade each RUBRIC item the PRD claims against the real code + output; flag any schema drift (wrong field/event/endpoint names, casing), any stub/fake where real logic is required, any test that does not actually assert what it claims, and (fence) confirm the deny is exit-0 + hookSpecificOutput and fail-open holds; (arbiter) confirm the model is NOT on the fence path, advise() is injectable, and the two advisories genuinely differ + name each recipient's file; (tower) confirm it is read-only (no POST to bus), the served HTML embeds registry_version 8, and it works with the bus as the only source. Set verdict 'pass' ONLY if the track's tests are green AND all hold on real code; else 'fail' with specific issues. Return structured findings (track="${t.key}").`
}

const results = await pipeline(
  TRACKS,
  (t) => agent(implPrompt(t), { label: `impl:${t.key}`, phase: 'Implement', agentType: 'general-purpose', schema: IMPL_SCHEMA }),
  (impl, t) => agent(verifyPrompt(t), { label: `verify:${t.key}`, phase: 'Verify', agentType: 'general-purpose', schema: VERIFY_SCHEMA })
    .then((verdict) => ({ track: t.key, impl, verdict })),
)

return results
