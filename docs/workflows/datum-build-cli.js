export const meta = {
  name: 'datum-build-cli',
  description: 'Build the full datum CLI cockpit (router + lib + ~20 command modules, --json, fail-soft, ANSI discipline) then adversarially verify it against a seeded bus',
  phases: [
    { title: 'Implement', detail: 'refactor cli into a command registry + build all commands + tests to green' },
    { title: 'Verify', detail: 'fresh-eyes verifier drives the real CLI against a seeded bus' },
  ],
}
const IMPL_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['summary', 'files_written', 'commands', 'own_tests_passed', 'test_output_tail'],
  properties: {
    summary: { type: 'string' },
    files_written: { type: 'array', items: { type: 'string' } },
    commands: { type: 'array', items: { type: 'string' }, description: 'the command names implemented' },
    own_tests_passed: { type: 'boolean' }, test_output_tail: { type: 'string' },
    sample_status_output: { type: 'string', description: 'the rendered `datum status` (text) against a seeded bus' },
    notes: { type: 'string' },
  },
}
const VERIFY_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['verdict', 'own_tests_passed', 'rubric_checks', 'issues', 'summary'],
  properties: {
    verdict: { type: 'string', enum: ['pass', 'fail'] }, own_tests_passed: { type: 'boolean' },
    rubric_checks: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['item', 'pass', 'evidence'], properties: { item: { type: 'string' }, pass: { type: 'boolean' }, evidence: { type: 'string' } } } },
    issues: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['severity', 'detail'], properties: { severity: { type: 'string' }, detail: { type: 'string' }, file: { type: 'string' } } } },
    summary: { type: 'string' },
  },
}

const IMPL = `You are building the **datum CLI** — the cockpit, the PRIMARY product surface for a real devtools company (think \`git\`/\`gh\`: fast, scriptable, fail-soft, self-documenting). Build it for real, with tests, iterate to green.

READ FIRST (Read): docs/prd/cli.md (your full spec — the command list, architecture, conventions, acceptance test), docs/prd/schema.md (§4 bus HTTP API, §8 .datum/state.json), cli/datum.ts + cli/init.ts (the EXISTING router you refactor — preserve init/decide/demo behavior), docs/datum-design-context.md (the color discipline + vocabulary + "terminal is the cockpit").

HARD CONSTRAINTS:
- Zero install: Node built-ins only (node:fs, node:path, node:child_process, fetch, node:test). No deps, don't touch package.json/tsconfig. Native TS + ESM; relative imports use explicit .ts extensions.
- Refactor cli/datum.ts into a COMMAND REGISTRY: a COMMANDS map (cli/commands/index.ts) of { name, aliases?, summary, usage, run(ctx)->Promise<number> }; the router parses argv + global flags and dispatches. Preserve the existing init/decide/demo behavior (port them into command modules).
- Build cli/lib/client.ts (fail-soft bus client over §4: version, registry, deltas(since), sessions, advisories(id), decide, events, health, stream(onEvent) via SSE — every method returns a result object, NEVER throws), cli/lib/state.ts (.datum/state.json read/write + settings.json helpers), cli/lib/format.ts (ANSI per the STRICT color discipline: amber=contract/epoch, red=fence/breaking, blue=advisory, green=synced/reconciled, gray=ambient; the ⌖ mark; identifiers steady; AUTO-DISABLE ANSI when !process.stdout.isTTY OR NO_COLOR set OR --no-color; a --json mode that prints machine JSON instead of styled text; epoch-strip + table + chip helpers).

BUILD every command in docs/prd/cli.md: help (global grouped + per-command), version, init, doctor, uninstall, status, sync, claim, advisories, check, watch, registry(alias truth), show, diff, log(alias ledger), decide, serve, tower, demo. Honor: global flags (--bus-url/DATUM_BUS_URL, --json, --no-color, -h/--help, -v/--version); EXIT CODES (0 ok, 1 error, 2 drift-detected — \`datum check\` and \`datum doctor-when-behind\` exit 2); fail-soft (bus down -> local-cache view from .datum/state.json + one-line warning, never a stack trace); bare \`datum\` -> status if state exists else help.

Key behaviors: \`datum status\` renders the terminal tower-glance (epoch, your sync state synced-to-vN/off-datum-by-M, claim, live sessions + presence initials, recent deltas, your advisories). \`datum sync\` advances last_synced_version (PATCH /sessions/:id + write-back) and prints what changed. \`datum check [path]\` dry-runs decideFence (import from ../server/fence.ts) against /deltas and exits 2 on deny with a reason naming contract/change/author. \`datum doctor\` prints a ✓/✗ checklist (Node, state.json, the 3 wired hooks + mcpServers.datum, bus reachable, sync state). \`datum show db.users\` shows version history who/when/why. \`datum log\` is the ledger like git log. \`datum watch\` SSE-tails events color-coded.

TEST: test/cli.test.ts — drive the router (import main/run) against an ephemeral seeded bus (startBus from ../server/index.ts + seedScenario from ../server/seed.ts + applyEdit asha's migration -> epoch 8) and a tmp .datum/state.json. Assert the docs/prd/cli.md acceptance list: help lists grouped commands (exit 0); version prints; status (text + --json) shows epoch 8 + sync state; registry --json lists db.users v8; log --json shows #112/#111/#110; show db.users includes the rename; check on a .email write while behind -> exit 2 + deny reason naming db.users/email/contact_email/asha; doctor reachable-bus exit 0 and behind exit 2; decide epoch-neutral; unknown command -> usage + exit 1; bus-down fail-soft (no throw); --no-color/non-TTY emits no ANSI escapes. Run \`node --test test/cli.test.ts\` and FIX to green.

Quality bar: this is a real product CLI. Crisp copy in the datum voice (terse, lowercase product nouns, mono identifiers, who/when/why on every assertion, cartographic microcopy sparingly: "off datum by 2 versions", "synced to v8"). When green, return the structured result incl a real \`datum status\` sample.`

phase('Implement')
const impl = await agent(IMPL, { label: 'impl:cli', phase: 'Implement', agentType: 'general-purpose', schema: IMPL_SCHEMA })

phase('Verify')
const VERIFY = `You are an INDEPENDENT VERIFIER (fresh eyes) for the datum CLI. Do not trust the implementer.
READ: docs/prd/cli.md (acceptance), docs/prd/schema.md, then the REAL code in cli/.
DO:
1. Run \`node --test test/cli.test.ts\` yourself; report green/not.
2. Actually EXECUTE the CLI end-to-end against a real seeded bus: in a tmp project dir, start the bus (node server/index.ts or startBus), seed it to epoch 8, write a .datum/state.json (last_synced 7, bus_url), then run real commands via \`node cli/datum.ts <cmd>\`: help, version, status, status --json, registry --json, log, show db.users, check routes/users.ts (assert EXIT CODE 2 + deny reason names db.users/email/contact_email/asha), doctor (exit 2 when behind), decide "x", an unknown command (exit 1), and a bus-down run (assert fail-soft: exit non-2 with a friendly message, NO stack trace). Pipe one command to confirm NO ANSI escape codes when non-TTY / --no-color.
3. Grade: registry/command pattern is real (not a stub); --json paths are valid JSON; exit codes correct (esp 2=drift); fail-soft holds; color discipline + auto-disable correct; init/decide/demo still work; the model is NOT pulled onto datum status/check beyond the deterministic decideFence (no Anthropic import in the CLI).
Flag any stub-where-real-logic-required, schema drift, or weak test. Set verdict 'pass' ONLY if tests green AND the real commands behave as specified. Return structured findings.`
const verdict = await agent(VERIFY, { label: 'verify:cli', phase: 'Verify', agentType: 'general-purpose', schema: VERIFY_SCHEMA })

return { impl, verdict }
