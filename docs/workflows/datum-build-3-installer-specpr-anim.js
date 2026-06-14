export const meta = {
  name: 'datum-build-3-installer-specpr-anim',
  description: 'Parallel build of hooks+installer (#3), spec-pr (#5), drift-card animation (#8), each implement then adversarially verify',
  phases: [
    { title: 'Implement', detail: 'installer + spec-pr + animation in parallel, each runs only its own test file' },
    { title: 'Verify', detail: 'per-track fresh-eyes verifier grades PRD + RUBRIC' },
  ],
}

const IMPL_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['track', 'summary', 'files_written', 'own_tests_passed', 'test_output_tail'],
  properties: {
    track: { type: 'string' }, summary: { type: 'string' },
    files_written: { type: 'array', items: { type: 'string' } },
    own_tests_passed: { type: 'boolean' }, test_output_tail: { type: 'string' }, notes: { type: 'string' },
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

const COMMON = `SHARED RULES (all tracks):
- Zero install: Node built-ins ONLY (node:sqlite, node:http, node:test, node:child_process, fetch). NO npm install, NO new dependency, do NOT touch package.json/tsconfig/.gitignore. **No jsdom.**
- Native TS + ESM; relative imports use explicit .ts extensions. No build step. Run ONLY your own test file with \`node --test <file>\` to green (lead runs full suite at integration).
- The substrate is built: server/{db,store,watchlist,registry,reconcile,bus,index,seed}.ts, server/fence.ts (decideFence), hooks/datum-fence.ts, server/arbiter/{intersect,prompt,advise,index}.ts, web/{serve,index.html,tower.js,tokens-shim.css}. READ what you need and IMPORT from it; do NOT edit existing files outside your ownership.
- Code against docs/prd/schema.md VERBATIM; honor docs/prd/RECONCILIATION.md (binding) + the sole-owner matrix; respect not-a-dashboard. Read your PRD first.
- Phase-0-verified hook facts: deny/inject = exit 0 + hookSpecificOutput; SessionStart/PostToolUse inject via hookSpecificOutput.additionalContext; PostToolUse input field is tool_response ?? tool_output; settings.json hooks use {matcher, hooks:[{type:"command", command, args}]} with \${CLAUDE_PROJECT_DIR}; prefer EXEC form (command:"node", args:["\${CLAUDE_PROJECT_DIR}/hooks/x.ts"]).`

const TRACKS = [
  {
    key: 'hooks-installer', title: 'three hooks + npx datum init installer', prd: 'docs/prd/hooks-installer.md', testfile: 'test/installer.test.ts',
    build: `Create cli/datum.ts, cli/init.ts, hooks/datum-join.ts, hooks/datum-claim.ts, test/installer.test.ts. (You are the SOLE owner of cli/init.ts; hooks/datum-fence.ts is fence-owned — only wire it.)
- hooks/datum-join.ts (SessionStart, runnable via node): read stdin JSON (session_id, cwd, source). Load .datum/state.json (human, branch, claim_files, claim_symbols, bus_url). POST {bus}/sessions -> { registry_version, snapshot, advisories }. Print {hookSpecificOutput:{hookEventName:'SessionStart', additionalContext}} where additionalContext is a compact human-readable registry snapshot ("datum: synced to v{registry_version}; contracts: db.users v8 ..."). Write last_synced_version back to .datum/state.json. FAIL OPEN (bus down -> exit 0, no context, log warning). Never throw.
- hooks/datum-claim.ts (PostToolUse, runnable via node): read stdin JSON (session_id, tool_name, tool_input, tool_response ?? tool_output). Build edit.streamed { session_id, human, tool_name, path, summary } (path from tool_input.file_path ?? path). POST {bus}/events. THEN PATCH {bus}/sessions/:id to advance last_synced_version to the returned registry_version AND write it back to .datum/state.json (the resync write-back — RECONCILIATION gap #2). Optionally print {hookSpecificOutput:{hookEventName:'PostToolUse', additionalContext:"datum: synced to v{n}"}}. FAIL OPEN. Never throw.
- cli/init.ts: export an idempotent \`mergeSettingsBlock(settings, blockKey, block)\` helper (merge, never clobber/duplicate; running twice is a no-op). export \`init({projectDir, busUrl, human, branch, claimFiles, claimSymbols})\`: writes/merges .claude/settings.json hooks: SessionStart -> datum-join, PostToolUse matcher "Edit|Write|MultiEdit" -> datum-claim, PreToolUse matcher "Edit|Write|MultiEdit" -> datum-fence (all EXEC form: command "node", args ["\${CLAUDE_PROJECT_DIR}/hooks/<name>.ts"]); registers the datum MCP server stanza under mcpServers via mergeSettingsBlock (server/mcp.ts is built by track #6 — register command "node" args ["\${CLAUDE_PROJECT_DIR}/server/mcp.ts"]); seeds .datum/state.json { session_id, human, branch, last_synced_version, claim_files, claim_symbols, bus_url }. Idempotent.
- cli/datum.ts: the npx entry (#!/usr/bin/env node). Subcommands: \`datum init\` (calls init with sensible flags/env), \`datum decide "..."\` (POST /decide), \`datum demo\` (delegates to demo/datum-demo.ts if present, else friendly message). Arg parse minimal.
- test/installer.test.ts (node --test test/installer.test.ts): run init() into a tmp projectDir; assert .claude/settings.json has SessionStart/PostToolUse/PreToolUse entries with EXEC-form node + \${CLAUDE_PROJECT_DIR} paths to the three hooks, an mcpServers.datum stanza, and .datum/state.json seeded with bus_url. Assert mergeSettingsBlock idempotency (init twice -> no duplicate hook entries). Then a RESYNC round-trip: startBus ephemeral + seed (epoch 7) in a tmp cwd with a seeded .datum/state.json (last_synced 7), spawn \`node hooks/datum-claim.ts\` with a PostToolUse JSON for asha's migrations/0042 edit on stdin; assert the bus epoch bumped to 8 AND .datum/state.json.last_synced_version advanced to 8. Clean up.`,
  },
  {
    key: 'spec-pr', title: 'spec-patch PR + ledger link', prd: 'docs/prd/spec-pr.md', testfile: 'test/spec-pr.test.ts',
    build: `Create server/arbiter/spec-pr.ts and test/spec-pr.test.ts. (Sole owner of spec-pr.ts.)
- export \`openSpecPR(delta, ledgerId, opts?: {repoDir, specPath, useGh}): Promise<{pr_number,url,contract_id,epoch,ledger_id,patch_path}>\`. Behavior: in repoDir (a git repo), patch specPath (default "docs/spec.md") applying the delta's mechanical_change (users.email -> contact_email, note "migration 0042"); create a branch (e.g. datum/spec-v{epoch}) + commit the patch; if opts.useGh AND a GitHub remote exists -> \`gh pr create\` (via node:child_process) and capture the PR number/url; ELSE produce a LOCAL PR artifact: the branch + a .datum-pr/spec-v{epoch}.patch + a pr.json {pr_number, url, title, body, branch, base, ledger_id}. LINK the existing ledger entry by id (input ledgerId — do NOT POST /decide / do NOT create a ledger row). Emit a 'spec.pr.opened' event { pr_number, url, contract_id, epoch, ledger_id, patch_path } (append to the bus/store if a busUrl/store is provided, else return it). Idempotent: re-running for the same epoch must not open a duplicate PR or rewrite the ledger. PR number defaults to 14 for the hero epoch (honest demo value) but derive sensibly.
- test/spec-pr.test.ts (node --test test/spec-pr.test.ts): create a tmp git repo (node:child_process: git init, commit a docs/spec.md fixture containing "users.email"); call openSpecPR(heroDelta, 112, {repoDir, useGh:false}); assert docs/spec.md now contains "contact_email" and NOT a bare "users.email" (the rename applied + migration 0042 noted); a local PR artifact (pr.json + .patch) exists on a new branch; exactly one spec.pr.opened with patch_path "docs/spec.md", epoch 8, ledger_id 112, non-empty pr_number + url. Assert idempotency: a second call does not duplicate the PR artifact. Runs fully offline (useGh:false), web app stopped (not-a-dashboard).`,
  },
  {
    key: 'drift-card-animation', title: 'LiveDriftCard animation state machine', prd: 'docs/prd/drift-card-animation.md', testfile: 'test/drift-card.test.ts',
    refs: 'docs/datum-drift-card-animation-spec.md, docs/datum_drift_card_animation_reference.html',
    build: `Create web/drift-card.js, web/anim.css, test/drift-card.test.ts. Consume web/tower.js (its SSE onEvent hook) + web/tokens-shim.css (READ-ONLY — tower is sole owner). NO jsdom.
- web/drift-card.js: structure as (a) a PURE reducer \`reduceDriftState(state, event): state\` — the explicit state machine; (b) a thin \`renderDriftCard(state, els, {reducedMotion})\` that applies state to the DOM; (c) \`LiveDriftCard\` wiring that subscribes to tower.js's event hook (live SSE) OR a scripted emitter, and on each Event calls reduce then render. The reducer is pure (no DOM, no Date.now) so it is unit-testable without a browser.
- State machine per docs/datum-drift-card-animation-spec.md: stages calm->detected->fenced->advised->reconciling->reconciled->patched. Event map (schema §3, exact strings): delta.detected -> detected (epoch from_version/to_version, why, mechanical_change; epoch.tick v7->v8); write.fenced -> fenced (ben node neutral->red + lock + header red); advisory.delivered -> advised (route by Advisory.severity: 'fence'->red retained, 'advisory'-> chen node neutral->blue); reconciled with payload.workspace!==true -> increment reconciling count + that session's node -> green (DISAMBIGUATE on payload.workspace===true, NOT on type); reconciled with workspace===true -> reconciled (header green, settle); spec.pr.opened -> patched (footer reveals "spec PR #{pr_number} · {patch_path} · ledger #{ledger_id}"). State carries: stage, epoch{from,to}, chips{detected,fenced,advised,reconciled:{count,total:2},pr}, nodes{ben:{color,label}, chen:{color,label}, center}, footer, reducedMotion.
- web/anim.css: the animation tokens VERBATIM from the spec (card.expand 420ms cubic-bezier(.16,1,.3,1); epoch.tick 480ms cubic-bezier(.65,0,.35,1); node.fence 200ms cubic-bezier(.34,1.56,.64,1) — the one overshoot; settle.pulse 520ms; footer.slide 300ms; ripple 640ms single; chip.activate/complete; line.draw stagger 80ms). Gate ALL motion behind @media (prefers-reduced-motion: reduce) -> opacity crossfades only; all info (colors, labels, count) still reads.
- test/drift-card.test.ts (node --test test/drift-card.test.ts, NO DOM): import reduceDriftState; feed the verbatim §9 event sequence (delta.detected, write.fenced for ben, advisory.delivered x2, reconciled per-session ben, reconciled per-session chen, workspace reconciled, spec.pr.opened #14). Assert: stage progresses calm->detected->fenced->advised->reconciling->reconciled->patched IN ORDER; ben node neutral->red->green; chen node neutral->blue->green; reconciled count reaches 2/2; footer exposes PR #14 and ledger #112; a per-session reconciled with workspace:true is treated as workspace-complete (disambiguation). Assert reduced-motion does NOT change final reduced state (reducer is motion-agnostic; final colors/labels/count identical).`,
  },
]

function implPrompt(t) {
  return `${COMMON}\n\nYOUR TRACK: ${t.title} (key: ${t.key}). PRD: ${t.prd}${t.refs ? `. Refs: ${t.refs}` : ''}.\n\n${t.build}\n\nWhen your own test file is green, return the structured result (track="${t.key}"). Do not over-explain.`
}
function verifyPrompt(t) {
  return `You are an INDEPENDENT VERIFIER (fresh eyes) for the Datum track "${t.key}" — ${t.title}. Do not trust the implementer.\nREAD: ${t.prd} (acceptance), docs/prd/schema.md, docs/prd/RECONCILIATION.md, then the REAL code.\nDO: run \`node --test ${t.testfile}\` yourself; grade each RUBRIC item the PRD claims against real code + output; flag schema drift, stubs-where-real-logic-required, and tests that don't assert what they claim. Track-specifics: (hooks-installer) confirm datum-claim does the PATCH /sessions/:id RESYNC write-back to .datum/state.json (RECONCILIATION gap #2), settings.json uses exec-form node + \${CLAUDE_PROJECT_DIR}, mergeSettingsBlock is idempotent, all three hooks fail open; (spec-pr) confirm it LINKS ledger #112 (never POST /decide), patches docs/spec.md email->contact_email, emits exactly one spec.pr.opened, works offline (useGh:false), idempotent; (drift-card-animation) confirm reduceDriftState is pure + tested WITHOUT jsdom, all 7 stages in order, node colors ben red->green & chen blue->green, count 2/2, footer PR#14/ledger#112, reconciled disambiguation on payload.workspace===true, reduced-motion preserves all info. Set verdict 'pass' ONLY if tests green AND all hold on real code; else 'fail' with specific issues. Return structured findings (track="${t.key}").`
}

const results = await pipeline(
  TRACKS,
  (t) => agent(implPrompt(t), { label: `impl:${t.key}`, phase: 'Implement', agentType: 'general-purpose', schema: IMPL_SCHEMA }),
  (impl, t) => agent(verifyPrompt(t), { label: `verify:${t.key}`, phase: 'Verify', agentType: 'general-purpose', schema: VERIFY_SCHEMA })
    .then((verdict) => ({ track: t.key, impl, verdict })),
)
return results
