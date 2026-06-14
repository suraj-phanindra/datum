export const meta = {
  name: 'datum-phase1-prds',
  description: 'Author a PRD per Datum feature against the frozen schema, then run an adversarial anti-drift critic over all of them',
  phases: [
    { title: 'PRDs', detail: 'one author per feature, parallel, coding against docs/prd/schema.md' },
    { title: 'Critique', detail: 'single critic reads schema + all PRDs, flags gaps/contradictions/contract-conflicts' },
  ],
}

const FEATURES = [
  { key: 'bus-registry', n: 1, title: 'bus + registry (substrate)', tier: 'P0', track: 'A', refs: '' },
  { key: 'fence', n: 2, title: 'the deterministic fence (PreToolUse)', tier: 'P0', track: 'B', refs: '' },
  { key: 'self-correction', n: 3, title: 'agent self-correction', tier: 'P0', track: 'B/D', refs: '' },
  { key: 'hooks-installer', n: 4, title: 'three hooks + npx datum init installer', tier: 'P0', track: 'B', refs: '' },
  { key: 'demo-runner', n: 5, title: 'headless datum demo + workspace-invites seed + emitter', tier: 'P0', track: 'D', refs: '' },
  { key: 'arbiter', n: 6, title: 'the arbiter (Opus 4.8, off critical path)', tier: 'P1', track: 'C', refs: '' },
  { key: 'spec-pr', n: 7, title: 'spec-patch PR + ledger entry', tier: 'P1', track: 'C', refs: '' },
  { key: 'tower', n: 8, title: 'the web tower (read-only)', tier: 'P1', track: 'D', refs: 'docs/datum-design-context.md, docs/datum_tower_drift_state.html, the "datum Design System/readme.md" and tokens/*.css' },
  { key: 'drift-card-animation', n: 9, title: 'LiveDriftCard animation state machine', tier: 'P1', track: 'D', refs: 'docs/datum-drift-card-animation-spec.md, docs/datum_drift_card_animation_reference.html' },
  { key: 'mcp-server', n: 10, title: 'MCP server (registry tools)', tier: 'P2', track: 'A', refs: '' },
  { key: 'deploy', n: 11, title: 'deploy tower to a live URL', tier: 'P2', track: 'D', refs: '' },
  { key: 'stop-guard', n: 12, title: 'Stop guard hook (stretch)', tier: 'P3', track: 'B', refs: '' },
]

const PRD_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['feature', 'prd_markdown', 'files_touched', 'rubric_items', 'one_line'],
  properties: {
    feature: { type: 'string' },
    prd_markdown: { type: 'string', description: 'Full PRD, ~250-450 words, with the exact required section headings' },
    files_touched: { type: 'array', items: { type: 'string' } },
    rubric_items: { type: 'array', items: { type: 'string' }, description: 'Exact RUBRIC.md lines this feature satisfies' },
    open_questions: { type: 'array', items: { type: 'string' } },
    one_line: { type: 'string' },
  },
}

const CRITIC_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['gaps', 'contradictions', 'schema_conflicts', 'ownership_conflicts', 'sequencing_risks', 'overall_assessment', 'blocking_count'],
  properties: {
    gaps: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['rubric_item', 'detail', 'recommended_owner'], properties: { rubric_item: { type: 'string' }, detail: { type: 'string' }, recommended_owner: { type: 'string' } } } },
    contradictions: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['between', 'field', 'detail', 'resolution'], properties: { between: { type: 'array', items: { type: 'string' } }, field: { type: 'string' }, detail: { type: 'string' }, resolution: { type: 'string' } } } },
    schema_conflicts: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['feature', 'schema_ref', 'detail', 'fix'], properties: { feature: { type: 'string' }, schema_ref: { type: 'string' }, detail: { type: 'string' }, fix: { type: 'string' } } } },
    ownership_conflicts: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['file', 'claimed_by', 'resolution'], properties: { file: { type: 'string' }, claimed_by: { type: 'array', items: { type: 'string' } }, resolution: { type: 'string' } } } },
    sequencing_risks: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['detail', 'fix'], properties: { detail: { type: 'string' }, fix: { type: 'string' } } } },
    overall_assessment: { type: 'string' },
    blocking_count: { type: 'number' },
  },
}

function prdPrompt(f) {
  return `You are authoring the PRD for the Datum feature: "${f.title}" (key: ${f.key}, tier ${f.tier}, track ${f.track}).

READ FULLY before writing (use the Read tool):
- docs/prd/schema.md  — the FROZEN shared contract. You MUST use its exact type names, field names, function signatures, HTTP endpoints, and event-type strings. Do NOT invent or rename anything that lives in the schema.
- docs/prd/README.md   — find your scope brief (feature #${f.n}, "${f.key}").
- CLAUDE.md            — master context (architecture, hooks, not-a-dashboard discipline).
- docs/RUBRIC.md       — the acceptance criteria; tie your acceptance test to specific lines.
${f.refs ? `- Design refs for this feature: ${f.refs}` : ''}

Datum context: a real-time coordination layer for teams running Claude Code agents. Fast deterministic path (watchlist detection + version fence) + slow model path (Opus 4.8 arbiter, off the critical path). Keep the model off the critical path; fail open; build the terminal path first; the dashboard is read-only.

Write a TIGHT PRD (~250-450 words) with EXACTLY these section headings, in this order:
## ${f.title}
### Visible behavior   (what a viewer/user observes; for the demo, what is on camera)
### Interface / contract   (cite exact schema.md names: types, functions like decideFence/classifyEdit/bumpRegistry, endpoints, event strings, the Advisory/MechanicalChange/FenceDecision shapes as relevant)
### Acceptance test   (name the test file from your scope brief; quote the specific RUBRIC.md requirement it satisfies; describe the assertion)
### Files it touches   (exact paths under server/ cli/ hooks/ web/ demo/ test/)
### Open questions / risks   (anything genuinely ambiguous or a sequencing dependency)

Rules: code against schema.md verbatim; respect the not-a-dashboard discipline (the fence/advisory/spec-PR must work with the web app stopped); the model is never on the critical path. Be concrete and demo-grounded — use the verbatim sample data (db.users v7→v8, users.email→contact_email, migration 0042, asha/ben/chen) where relevant.

Do NOT write any files. Return the PRD as prd_markdown plus the structured metadata.`
}

phase('PRDs')
const prds = (await parallel(
  FEATURES.map((f) => () => agent(prdPrompt(f), { label: `prd:${f.key}`, phase: 'PRDs', schema: PRD_SCHEMA }))
)).filter(Boolean)

log(`Authored ${prds.length}/${FEATURES.length} PRDs. Running anti-drift critic over schema + all PRDs.`)

phase('Critique')
const bundle = prds.map((p) => `===== PRD: ${p.feature} =====\n${p.prd_markdown}\n(files: ${(p.files_touched || []).join(', ')})\n(rubric: ${(p.rubric_items || []).join(' | ')})`).join('\n\n')

const criticPrompt = `You are the ANTI-DRIFT CRITIC for the Datum build — the same drift Datum itself prevents. The team just authored ${prds.length} PRDs in parallel against a frozen shared schema. Your job: find where they drifted from each other or from the contract, BEFORE any code is written.

READ FROM DISK: docs/prd/schema.md (the FROZEN contract) and docs/RUBRIC.md (acceptance criteria). The ${prds.length} PRDs are pasted below.

Find and report, with specific, actionable reconciliations:
1. GAPS — a RUBRIC.md requirement that NO PRD owns (e.g. "fence fires with arbiter disabled", "<50ms cache hit", "three branches merge clean", "live URL 200 @ v8", "two advisories differ"). For each, name the recommended owner feature.
2. CONTRADICTIONS — two PRDs that disagree on a shared field name, endpoint, event string, version semantics, or behavior.
3. SCHEMA_CONFLICTS — any PRD that contradicts or renames something in schema.md (types, fields, function signatures decideFence/classifyEdit/bumpRegistry, endpoints, event strings, Advisory/FenceDecision/MechanicalChange shapes, the registry_version vs per-contract version model).
4. OWNERSHIP_CONFLICTS — two PRDs claiming the same file/responsibility, or a needed file/responsibility that is unowned.
5. SEQUENCING_RISKS — a feature built before a dependency, or a demo-critical path that depends on something marked stretch/static.

Be rigorous and skeptical. If something is fine, do not invent problems, but do not rubber-stamp. Set blocking_count = number of findings that would break the RUBRIC if unaddressed. Return structured findings only.

----- PRDs -----
${bundle}`

const critique = await agent(criticPrompt, { label: 'anti-drift-critic', phase: 'Critique', schema: CRITIC_SCHEMA })

return { prds, critique }
