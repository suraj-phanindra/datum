export const meta = {
  name: 'datum-package-datumctl',
  description: 'Make datum genuinely npx-installable as datumctl (esbuild bundle to dist JS, fix init hook packaging for any workspace), then prove it with a clean-room install that fences',
  phases: [
    { title: 'Package', detail: 'esbuild bundle -> dist; dual-mode init; package.json for publish; keep dev tests green' },
    { title: 'Clean-room verify', detail: 'npm pack + install outside the repo + datumctl init + real fence' },
  ],
}
const IMPL_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['summary', 'files_written', 'dev_tests_passed', 'build_ok', 'notes'],
  properties: {
    summary: { type: 'string' },
    files_written: { type: 'array', items: { type: 'string' } },
    dev_tests_passed: { type: 'boolean', description: 'the existing `npm test` (97 .ts tests) still green' },
    build_ok: { type: 'boolean', description: '`npm run build` produced dist/' },
    dist_listing: { type: 'string' },
    notes: { type: 'string' },
  },
}
const VERIFY_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['verdict', 'rubric_checks', 'issues', 'summary'],
  properties: {
    verdict: { type: 'string', enum: ['pass', 'fail'] },
    rubric_checks: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['item', 'pass', 'evidence'], properties: { item: { type: 'string' }, pass: { type: 'boolean' }, evidence: { type: 'string' } } } },
    issues: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['severity', 'detail'], properties: { severity: { type: 'string' }, detail: { type: 'string' }, file: { type: 'string' } } } },
    summary: { type: 'string' },
  },
}

const IMPL = `Make the datum project genuinely installable as the npm package **datumctl** (the user chose this name + chose to publish). This is real packaging work. Build for real and keep the existing dev flow green.

READ FIRST: package.json, cli/datum.ts + cli/init.ts (init's hook wiring is the core gap), cli/commands/{serve,tower,demo,doctor}.ts (they spawn subprocesses by path), hooks/datum-{fence,claim,join,guard}.ts, server/index.ts + server/mcp.ts, docs/prd/cli.md, docs/prd/schema.md.

THE CORE GAP TO FIX: today init writes hooks as \`node \${CLAUDE_PROJECT_DIR}/hooks/datum-fence.ts\` — but in an EXTERNAL user's workspace those files don't exist (they live in the datum install, and the hooks import ../server/*). A clean install would wire hooks to missing files and silently fail-open. Fix it.

DO:
1. **Build step (esbuild).** \`npm install --save-dev esbuild\` (devDep only; consumers get bundled JS with ZERO runtime deps since the app uses only node: built-ins). Write scripts/build.mjs that bundles each entrypoint to self-contained dist/ JS (platform node, format esm, bundle:true, external: node:* built-ins, target node18). Bundle: cli/datum.ts -> dist/datum.js (with banner '#!/usr/bin/env node'), hooks/datum-{fence,claim,join,guard}.ts -> dist/hooks/datum-*.js (each fully self-contained — the ../server import tree inlined), server/index.ts -> dist/server.js, server/mcp.ts -> dist/mcp.js. Use esbuild's \`define\` to inject a build flag (e.g. process.env.DATUM_DIST or a global __DATUM_DIST__=true) so the bundled code knows it is the installed build.
2. **Dual-mode init (the fix).** cli/init.ts must resolve the hook + mcp paths from the RUNNING module's own location (import.meta.url), not \${CLAUDE_PROJECT_DIR}: in the installed/dist build, write ABSOLUTE exec-form commands \`node <pkgRoot>/dist/hooks/datum-fence.js\` (+ datum-claim/join/guard) and mcpServers.datum -> \`node <pkgRoot>/dist/mcp.js\`, where pkgRoot is resolved from the bin's dist dir. In dev/source (monorepo, tests), keep the current source-.ts \${CLAUDE_PROJECT_DIR} behavior so the existing installer.test.ts + the monorepo still work. Gate on the injected DATUM_DIST flag (or detect dist vs source by import.meta.url). Self-contained dist hooks have no ../server import, so they run with \`node <path>\` on any Node 18+.
3. **CLI subprocess commands.** serve/tower/demo currently spawn .ts source paths. In the installed build, resolve + spawn the dist equivalents (dist/server.js for serve, dist/mcp.js where relevant). If the tower/demo can't be cleanly bundled for the package in this pass, make \`datumctl tower\`/\`datumctl demo\` print a clear "run from the datum source repo" message rather than crash — but \`datumctl serve\` (the bus) MUST work from the install (bundle dist/server.js).
4. **package.json for publish:** name "datumctl"; REMOVE "private"; bin { "datumctl": "dist/datum.js" }; files ["dist","README.md","LICENSE"]; engines node ">=18"; scripts.build "node scripts/build.mjs"; scripts.prepublishOnly "npm run build"; keep scripts.test as-is (node --test on .ts SOURCE — dev runtime stays zero-install + must still pass). version 0.1.0. Add a short "Install" section to README (npx datumctl init).
5. **Do NOT break dev:** the .ts source + \`npm test\` (97 tests) must remain green (init's dev branch unchanged). Run \`npm test\` and confirm 97 pass. Then run \`npm run build\` and confirm dist/ is produced (list it).

Constraints: keep the app's runtime zero-dependency (esbuild is a devDep, never shipped; bundles inline our own code, node: built-ins stay external). Native TS dev unaffected. Return the structured result.`

phase('Package')
const impl = await agent(IMPL, { label: 'impl:datumctl', phase: 'Package', agentType: 'general-purpose', schema: IMPL_SCHEMA })

phase('Clean-room verify')
const VERIFY = `You are an INDEPENDENT VERIFIER. Prove that **datumctl** actually installs and FENCES from a clean install OUTSIDE this monorepo (the whole point — init must not depend on the monorepo layout). Do not trust the implementer.

DO, in order:
1. \`npm test\` in the repo -> confirm the dev suite is still 97/97 (packaging must not break the source runtime).
2. \`npm run build\` -> confirm dist/ has datum.js (with a node shebang), dist/hooks/datum-{fence,claim,join,guard}.js, dist/server.js, dist/mcp.js. Spot-check that a dist hook is SELF-CONTAINED (no \`require('../server')\`/unresolved relative import — grep the bundle).
3. \`npm pack\` -> a datumctl-0.1.0.tgz. Inspect \`tar tzf\` it: it must contain dist/ + package.json + README, and must NOT contain the .ts source tree, tests, node_modules, the design system, or .env.
4. CLEAN ROOM: in a fresh tmp dir (NOT inside the datum repo), \`npm init -y\` then \`npm install <abs path to the .tgz>\`, then run the installed bin: \`npx datumctl --help\` and \`npx datumctl version\` (exit 0). Then make a throwaway WORKSPACE dir (also outside the repo, no datum source), run \`npx datumctl init --human ben --branch ben/api --files routes/users.ts --bus-url http://127.0.0.1:4399\` there, and assert: .claude/settings.json hook commands point at the INSTALLED package's dist/hooks/*.js as ABSOLUTE paths (NOT \${CLAUDE_PROJECT_DIR}/hooks, NOT .ts), and those files EXIST on disk.
5. REAL FENCE FROM THE INSTALL: start the installed bus (\`node <install>/node_modules/datumctl/dist/server.js\` or via \`npx datumctl serve\` if it backgrounds — else node the dist/server.js) on port 4399; seed it (POST an edit.streamed for asha's migration so db.users -> contact_email, registry v8); in the workspace set .datum/state.json last_synced_version=7; pipe a PreToolUse JSON (an Edit to routes/users.ts whose new_string selects \`.email\`) into the INSTALLED \`node <install>/dist/hooks/datum-fence.js\` with cwd=workspace; assert stdout is permissionDecision:"deny" with a reason naming db.users + email + contact_email + asha. THIS proves a stranger's \`npx datumctl init\` produces a working fence.
6. Clean up the tmp dirs + any bus process.

Set verdict 'pass' ONLY if: dev suite 97/97, build produced self-contained dist hooks, the tarball is clean, a clean-room install wires ABSOLUTE installed hook paths, and the installed fence DENIES the stale write. Else 'fail' with specifics. Return structured findings.`
const verdict = await agent(VERIFY, { label: 'verify:datumctl', phase: 'Clean-room verify', agentType: 'general-purpose', schema: VERIFY_SCHEMA })

return { impl, verdict }
