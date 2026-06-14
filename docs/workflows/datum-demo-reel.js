export const meta = {
  name: 'datum-demo-reel',
  description: 'Build a self-playing 60s demo reel from the real datum components (tower, live drift card, cockpit terminals) choreographed through the shotlist, then verify it in a real browser with per-scene screenshots',
  phases: [
    { title: 'Build reel', detail: 'self-contained web/reel that plays the 6-beat arc with real components + playback controls' },
    { title: 'Browser verify', detail: 'load in a real browser, play, screenshot every scene, check verbatim strings + no console errors' },
  ],
}
const IMPL_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['summary', 'files_written', 'scenes', 'opens_via_file_url', 'notes'],
  properties: {
    summary: { type: 'string' },
    files_written: { type: 'array', items: { type: 'string' } },
    scenes: { type: 'array', items: { type: 'string' }, description: 'the scene ids in play order with their time windows' },
    opens_via_file_url: { type: 'boolean', description: 'works opened directly as a local file:// (no server, no ESM/CORS/fetch)' },
    controls: { type: 'string', description: 'the playback controls implemented' },
    notes: { type: 'string' },
  },
}
const VERIFY_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['verdict', 'checks', 'screenshots', 'issues', 'summary'],
  properties: {
    verdict: { type: 'string', enum: ['pass', 'fail'] },
    checks: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['item', 'pass', 'evidence'], properties: { item: { type: 'string' }, pass: { type: 'boolean' }, evidence: { type: 'string' } } } },
    screenshots: { type: 'array', items: { type: 'string' }, description: 'saved screenshot file paths, one per scene' },
    issues: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['severity', 'detail'], properties: { severity: { type: 'string' }, detail: { type: 'string' } } } },
    summary: { type: 'string' },
  },
}

const IMPL = `Build a **self-playing demo reel** for datum: ONE self-contained web page the founder hits "play" on and voiceovers, that animates through the entire 60-second shotlist using the REAL datum components. Output a directory web/reel/ (index.html + assets).

READ FIRST + REUSE (this must look like the real product, not a reinvention):
- web/index.html + web/tower.js + web/drift-card.js + web/anim.css + web/tokens-shim.css — the real tower layout + the LiveDriftCard state-machine animation (detected->fenced->advised->reconciling->reconciled->patched) + the strict-color animation tokens. LIFT these.
- docs/datum_tower_drift_state.html (the tower drift-state markup) + docs/datum-drift-card-animation-spec.md (the exact choreography + tokens: card.expand 420ms, epoch.tick 480ms, node.fence 200ms overshoot, settle.pulse 520ms, footer.slide 300ms).
- "datum Design System/tokens/*.css" (colors/typography/spacing/base/fonts) + "datum Design System/assets/fonts/*.woff2" (Geist + Geist Mono). Bake these in.
- docs/datum-design-context.md — strict color discipline (amber=contract/epoch, red=fence/breaking, blue=advisory, green=reconciled/synced, gray ambient), Geist Mono for ALL identifiers, calm-by-default, the ⌖ mark, lowercase product nouns.

THE REEL = a full-screen "stage" with a DIRECTOR that sequences these 6 scenes on a timeline (the founder's 60s cut), using real components + the verbatim sample data:
1. 0:00-0:07 COLD OPEN — three cockpit terminal panes (asha · asha/schema, ben · ben/api, chen · chen/ui) side by side, each an agent working (a few Geist-Mono lines + a blinking caret). Title flash "⌖ datum". Caption: "One team, three Claude Code agents, one feature. They start aligned."
2. 0:07-0:17 ASHA MIGRATES — asha's terminal types the migration (\`-- phone signups make email the wrong name\` then \`ALTER TABLE users RENAME COLUMN email TO contact_email;\` migration 0042), then the TOWER comes forward: the epoch strip ticks v7 -> v8 (amber, epoch.tick) and the drift card is BORN (detected 0.3s chip saturates amber, card.expand, single amber ripple). Caption: "asha renames a column and runs the migration. datum sees it in 0.3s."
3. 0:17-0:35 THE FENCE (hold here, the money shot) — ben's terminal full-frame: the agent drafts \`SELECT id, email FROM users WHERE id = $1\`, then a RED deny block appears with the verbatim reason: "db.users.email was renamed to contact_email (migration 0042, asha, 40s ago). Re-sync to v8 and use contact_email." HOLD it ~4s (readable). Then the agent re-syncs and rewrites to \`SELECT id, contact_email FROM users WHERE id = $1\` (green check). In sync, the tower drift card: ben node neutral->RED (node.fence punch)->later green; fenced 5.8s chip activates red. Caption: "ben's agent never writes the broken query. the fence blocks it, names the contract and asha, and it fixes itself — no human in the loop."
4. 0:35-0:46 TWO ADVISORIES — two advisory cards side by side, severity-colored (ben severity=fence/red top rule, chen severity=advisory/blue). VERBATIM bodies — ben (routes/users.ts): "users.email is now contact_email (migration 0042, asha); your open diff selects .email in two queries, update both before your next write." chen (UserCard.tsx): "UserDTO.email renamed, regenerate types from the API client; UserCard.tsx line 18 reads user.email and will break at runtime." Tower: advised 6.4s chip (blue), chen node -> blue. Caption: "Opus 4.8 writes each teammate a fix for their own file. two people, two different advisories."
5. 0:46-0:55 SPEC PR — a GitHub-PR-styled card: "#14 · spec: users.email -> contact_email (migration 0042)", a docs/spec.md diff (red \`- users.email\` / green \`+ contact_email\`), "3 branches merge clean". Tower drift card -> patched, footer slides up "spec PR #14 · docs/spec.md · ledger #112"; reconciled 2/2 green, settle pulse. Caption: "and it opens a pull request that updates the spec. a dashboard cannot do that."
6. 0:55-1:00 END CARD — the ⌖ mark + tagline "git coordinates code at rest. datum coordinates agents in motion." + a mono \`npx datumctl init\`. Caption same.

PLAYBACK CONTROLS (critical for voiceover): a big centered "▶ play" on a pre-roll poster; while playing show a thin amber progress bar + the current scene label + elapsed mm:ss. Keyboard: Space = pause/resume, ArrowRight/Left = jump to next/prev scene (so the founder can pace narration), R = replay from 0, C = toggle captions (default ON; OFF lets them do their own voiceover with no on-screen text). A "replay" button at the end.

HONESTY: the elapsed-time CHIP labels stay the real numbers (detected 0.3s, fenced 5.8s, advised 6.4s, reconciled 2/2, spec PR #14 @ 14:04); only the reel's wall-clock pacing is compressed (this is a time-lapse). Contracts: db.users v8, api.GET /users/:id v3, api.POST /invites v1, deps.db-driver v2.

SELF-CONTAINED + file://-ABLE (so they can open it locally and screen-record): index.html must work opened directly as a file:// URL — so NO ES module imports, NO fetch(), NO cross-origin. Inline the CSS in a <style> and the director JS in a classic <script> (not type=module). Bake the design tokens into the inline CSS; reference the Geist woff2 via RELATIVE paths copied into web/reel/assets/fonts/ (with a monospace/sans system fallback so it still reads if fonts miss). The reel must ALSO work served over http (for deploy). Respect prefers-reduced-motion (degrade to crossfades; all text still shows) but default to full motion.

When done: serve web/reel/ locally and confirm it loads + plays through all 6 scenes. Return the structured result.`

phase('Build reel')
const impl = await agent(IMPL, { label: 'impl:reel', phase: 'Build reel', agentType: 'general-purpose', schema: IMPL_SCHEMA })

phase('Browser verify')
const VERIFY = `You are a VISUAL VERIFIER for the datum demo reel (web/reel/index.html). Load it in a REAL browser and prove it plays the 60s arc + looks like the real product. Use the Playwright MCP browser tools (find them via ToolSearch: browser_navigate, browser_evaluate, browser_take_screenshot, browser_console_messages, browser_press_key, browser_click).

DO:
1. Serve web/reel/ over http on a free port (a tiny node:http static server) and browser_navigate to it. (Also confirm index.html has NO type=module script and NO fetch( — i.e. it would work via file:// — by grepping the file.)
2. Click play. Then for EACH of the 6 scenes, advance (ArrowRight or wait for the timeline), and browser_take_screenshot to a file reel-scene-{n}.png. You must capture: (1) cold open 3 terminals, (2) asha migration + epoch v7->v8 tick, (3) the FENCE deny block (the money shot — confirm the on-screen text contains "db.users.email", "contact_email", "migration 0042", "asha"), (4) the two DIFFERENT advisories (ben routes/users.ts + chen UserCard.tsx, different bodies), (5) the spec PR #14 card with the docs/spec.md diff, (6) the end card with the tagline + "npx datumctl init".
3. browser_console_messages(level error) -> assert ZERO console errors.
4. browser_evaluate to confirm: the reel uses Geist/Geist-Mono (identifiers in mono), the strict colors (a red fence beat, blue advisory, green reconciled, amber epoch), the lifecycle chips show the honest numbers (0.3s/5.8s/6.4s), and the playback controls exist (play/pause/replay/captions). Confirm the fence reason + both advisory bodies are present VERBATIM.
5. Confirm replay (R) and pause (Space) work.
Set verdict 'pass' ONLY if it plays through all 6 scenes with zero console errors, the verbatim strings are present, and it visually matches the design discipline. Return the screenshot paths + structured findings.`
const verdict = await agent(VERIFY, { label: 'verify:reel', phase: 'Browser verify', agentType: 'general-purpose', schema: VERIFY_SCHEMA })

return { impl, verdict }
