export const meta = {
  name: 'datum-build-team-layer',
  description: 'Build the self-hosted git-native team layer (workspace from git remote, identity from git config, committed datum.json, reachable bus, datumctl team) then verify two clones of one remote auto-join one team',
  phases: [
    { title: 'Implement', detail: 'git-native init + datum.json + workspace_id threading + serve --host + datumctl team; keep dev green + dist working' },
    { title: 'Verify', detail: 'clean-room: two repos with the same remote land in one workspace + roster' },
  ],
}
const IMPL_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['summary', 'files_written', 'dev_tests_passed', 'build_ok'],
  properties: {
    summary: { type: 'string' }, files_written: { type: 'array', items: { type: 'string' } },
    dev_tests_passed: { type: 'boolean' }, build_ok: { type: 'boolean' },
    sample_team_output: { type: 'string', description: 'rendered `datumctl team` against a seeded bus' }, notes: { type: 'string' },
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

const IMPL = `Build the **self-hosted, git-native team layer** for datum/datumctl. The user chose: self-hosted now + git-native identity (zero login). The team is the REPO; membership = having the repo; identity derives from git config.

READ FIRST: docs/prd/schema.md §10 (Teams — the FROZEN contract; code against it verbatim), cli/init.ts (dual-mode dev/dist — preserve it), cli/commands/{status,serve,index}.ts, cli/lib/{state,client,format}.ts, hooks/datum-join.ts, server/{db,store,bus,index}.ts, scripts/build.mjs, docs/prd/cli.md.

BUILD (per schema §10):
1. **cli/lib/git.ts** (new): deriveWorkspaceId(cwd) — \`git -C cwd remote get-url origin\` normalized to host/owner/repo (strip protocol, trailing .git, /); no remote -> "local/<basename of repo root or cwd>". gitUserName(cwd)/gitUserEmail(cwd) (\`git config user.name/.email\`, fallbacks $USER/""), currentBranch(cwd) (\`git rev-parse --abbrev-ref HEAD\`, fallback "main"). All fail-soft (never throw; missing git -> sensible fallback).
2. **datum.json** (committed team config) read/write — a helper (cli/lib/config.ts or in init): read repoRoot/datum.json { workspace, bus_url, watchlist?, spec_path? }; "workspace":"auto" means derive from the remote. Merge order bus_url/human: datum.json < env (DATUM_BUS_URL/DATUM_HUMAN) < flags.
3. **cli/init.ts**: derive human<-git user.name, email<-git user.email, branch<-current branch, workspace_id<-deriveWorkspaceId (flags --human/--branch override; --files/--symbols as before). If datum.json is ABSENT, CREATE it (workspace:"auto", bus_url from flag/env/default); if PRESENT, READ it (shared team config). Write .datum/state.json with the new fields workspace_id + email (schema §10). KEEP the dist/dev dual-mode hook-path behavior intact (installer.test.ts must still pass).
4. **server**: add workspace_id (and email) columns to the sessions table (server/db.ts) + Session type (store.ts); POST /sessions accepts + stores workspace_id/email; session.joined event includes workspace_id; GET /sessions returns them. The bus adopts the first workspace_id it sees as its workspace and WARNS (in the POST /sessions response, e.g. { warning }) when a session joins with a different workspace_id ("this bus serves X, you are in Y") — fail-open, never blocks. Make all new fields OPTIONAL/additive so existing tests stay green.
5. **server/index.ts startBus**: accept { host } (default 127.0.0.1). **cli/commands/serve.ts**: --host <h> and --public (=0.0.0.0) flags; print the bind URL + a one-line tunnel hint (tailscale/ngrok/cloudflared) when public.
6. **hooks/datum-join.ts**: send workspace_id + email (read from .datum/state.json) on POST /sessions; surface a bus workspace-mismatch warning via additionalContext (fail-open).
7. **cli/commands/team.ts** (new, register in cli/commands/index.ts): show workspace_id + bus_url + the live roster from GET /sessions (each member: human/email/branch/claim/status/synced version), in the datum voice + color discipline. --json supported. **cli/commands/status.ts**: header line shows the workspace ("team · <workspace_id>").
8. **Docs**: docs/prd/teams.md (the model: workspace=repo, git-native identity, datum.json, shared bus + tunnel, the roster, and a note that hosted multi-tenant SaaS is the next phase). Add a "Teams" section to README (one shared bus + datum init per engineer + datumctl team).
9. **TESTS** (test/team.test.ts): in tmp git repos, assert deriveWorkspaceId from a fake origin remote (github.com/acme/workspaces); git-native init with NO --human derives human from git config + workspace_id from the remote + branch; datum.json created on first init + READ on a second init (shared bus_url); TWO separate repos with the SAME remote derive the SAME workspace_id; the bus stores workspace_id on join + GET /sessions returns it + a mismatched workspace_id triggers a warning; datumctl team renders the roster. Keep ALL existing tests green.
10. Run \`npm test\` (must stay green, now higher count) and \`npm run build\` (dist regenerates; the installed datumctl init still derives git identity + writes workspace_id). Return the structured result with a real \`datumctl team\` sample.

CONSTRAINTS: zero runtime deps (Node built-ins + git via child_process; esbuild stays devDep); native TS dev + .ts imports; additive schema changes (don't break the 97 existing tests); preserve the dist dual-mode. Honor the schema §10 contract verbatim.`

phase('Implement')
const impl = await agent(IMPL, { label: 'impl:team-layer', phase: 'Implement', agentType: 'general-purpose', schema: IMPL_SCHEMA })

phase('Verify')
const VERIFY = `INDEPENDENT VERIFIER for the datum self-hosted git-native team layer. Do not trust the implementer. READ docs/prd/schema.md §10 + the real code in cli/ server/ hooks/.
DO:
1. \`npm test\` -> confirm green (>= the prior 97, plus the new team tests).
2. \`npm run build\` -> dist regenerates OK.
3. THE KEY PROOF (run it yourself): make TWO separate tmp git repos, BOTH with \`git remote add origin https://github.com/acme/workspaces.git\` and \`git config user.name\` set differently (e.g. ben in one, chen in the other) on different branches. In each, run \`node cli/datum.ts init\` (NO --human flag). Assert: each .datum/state.json has workspace_id === "github.com/acme/workspaces" (SAME for both -> they auto-join ONE team), human derived from git config (ben / chen), branch from git, and a datum.json was created/read. This proves "two clones of one repo are one team" with zero login.
4. Start a bus (node server/index.ts or startBus on an ephemeral port), join both sessions (POST /sessions with their workspace_id), and run \`node cli/datum.ts team --bus-url <bus>\` -> assert it lists BOTH members (ben + chen) with their branch/claim/status, under the workspace_id. Confirm GET /sessions returns workspace_id. Confirm a join with a DIFFERENT workspace_id yields a warning (fail-open, not blocked).
5. \`node cli/datum.ts serve --help\` / confirm --host/--public are accepted; confirm status header shows the workspace.
6. Confirm additive/no-regression: installer.test.ts + bus.test.ts + cli.test.ts still pass; the dist init still derives identity.
Set verdict 'pass' ONLY if the suite is green AND the two-clones-one-workspace proof + the roster both hold on real code. Else 'fail' with specifics. Return structured findings.`
const verdict = await agent(VERIFY, { label: 'verify:team-layer', phase: 'Verify', agentType: 'general-purpose', schema: VERIFY_SCHEMA })

return { impl, verdict }
