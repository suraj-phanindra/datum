# Datum design context

## What Datum is

Datum is the real-time coordination layer for teams of developers who each run AI coding agents (Claude Code today). It maintains a live, versioned source of truth for a team's contracts (DB schemas, API shapes, dependency versions, free-form decisions), captures every agent's activity through hooks, fences stale writes deterministically, and uses a frontier model arbiter to tell each affected teammate what a change means for their specific in-flight work. Tagline: git coordinates code at rest; Datum coordinates agents in motion.

## Surfaces and hierarchy

1. The terminal is the cockpit. Engineers live in Claude Code; Datum speaks there via injected advisories and fence denials. The web app must never duplicate cockpit jobs.
2. The web app is the tower. It shows what no single cockpit can see: the shared truth, who is building against what, drift as it happens, and the decision history.
3. TV mode. A presentation variant of the tower for a shared screen or demo projector: larger type, higher contrast, fewer affordances, legible from ten feet.
4. Mobile glance (later). One screen: fleet status, last delta, anything awaiting human arbitration.

## Core objects (use this sample data verbatim in mockups)

- Team: acme/workspaces, feature "workspace invites", 3 sessions live.
- Sessions: asha (data layer, branch asha/schema), ben (api, branch ben/api), chen (frontend, branch chen/ui). Each session is a human plus their agent.
- Contracts: db.users (v8), api.GET /users/:id (v3), api.POST /invites (v1), deps.db-driver (v2).
- The delta (hero event): db.users v7 to v8 at 14:02:11. users.email renamed to contact_email, migration 0042. Why, quoted from asha's session: "phone signups make email the wrong name."
- Lifecycle timestamps: detected 0.3s, ben's write fenced 5.8s, advisories delivered 6.4s, both consumers reconciled by 14:03:40, spec PR #14 opened 14:04.
- Advisories (note they differ per recipient):
  - To ben (routes/users.ts): "users.email is now contact_email (migration 0042, asha). Your open diff selects .email in two queries; update both before your next write."
  - To chen (UserCard.tsx): "UserDTO.email renamed; regenerate types from the API client. UserCard.tsx line 18 reads user.email and will break at runtime."
- Ledger entries: #112 14:02 asha, rename users.email (phone signups landing). #111 13:41 chen, adopt zod for DTO parsing. #110 13:18 ben, invites API returns 202 plus job id.
- Fleet metrics: deltas today 4, writes fenced 3, delta-to-fence 5.8s, rework avoided ~412k tokens.

## Screens and states

1. Tower (home).
   - Calm state: epoch strip with current version, quiet ledger feed, registry rail with presence, fleet status footer. Mostly neutral grays. Nothing pulses.
   - Drift state: a drift card takes visual priority. Anatomy below.
   - Arbitration state: two conflicting deltas side by side, the arbiter's proposed resolution, approve and reject actions for humans. Rare and serious; design it like a code review, not an alarm.
2. Registry (current truth). Browsable contracts with version history, who/when/why per version, presence avatars showing which sessions are currently building against each contract. Diff view between any two versions.
3. Replay (forensics). A time-scrubbing view for "what happened while I was out." A trace-waterfall or lane layout is acceptable here and only here.
4. Onboarding/install. One screen: the single install command, what hooks get written, a live "first event received" confirmation.

## The drift card (hero component)

A contract delta is a mini-incident with a lifecycle: detected, fenced, advised, reconciling, reconciled, spec patched. The card contains, top to bottom:
1. Header: contract name, version transition (v7 to v8), timestamp, severity tint.
2. Lifecycle chips with elapsed times.
3. The why: a one-line quote from the originating session, with the mechanical change in monospace.
4. Blast radius: a small radial graphic. Delta at center, affected sessions/files as nodes, each node carrying its status (fenced, advised, reconciled). This graphic is the product's signature; invest in it.
5. Resolution footer: spec PR link, ledger entry link.
Collapsed, the card is one calm line in the feed. Expanded (live drift), it owns the screen.

## Design principles

1. Calm by default, loud only on drift. Ambient activity is gray. Color exists to mark state changes.
2. The contract is the protagonist. Organize screens around contracts and versions, not around people or sessions. People appear as presence on contracts.
3. Presence makes it multiplayer. Small avatars (human plus agent as one unit) parked on the contracts and files they are currently building against, Figma style.
4. Every assertion carries who, when, why. No bare facts anywhere in the UI.
5. Truth has a version number. The epoch strip (v5 ... v8 live) appears on every screen as the spine.
6. Ten-foot legible. Key states must read from across a room. TV mode is a first-class variant, not an afterthought.
7. Terminal is the cockpit, web is the tower. If the terminal already shows it, the tower links to it rather than duplicating it.
8. Motion means something happened. Animation only on real events (a delta ripple, a version tick). Never decorative.

## Aesthetic direction

- References: Linear (crispness, purposeful motion), Vercel (monochrome plus one signal color), incident.io (incident lifecycle clarity), Warp (terminal-native warmth). Dev-tool sensibility, not analytics-dashboard sensibility.
- Dark-first, with a light variant. High contrast.
- Type: a quality sans for prose, monospace for every identifier (contract names, file paths, versions, timestamps). Identifiers are never proportional type.
- Color discipline (strict): neutral grays for ambient activity; amber only for contract-surface activity and the live epoch; red only for breaking deltas and fences; blue only for advisories; green only for reconciled and synced. No other use of these hues anywhere.
- Brand: the word datum comes from surveying, the fixed reference surface measurements derive from. Use the benchmark glyph (⌖) as the mark. Microcopy may use light cartographic language: "re-baselining", "off datum by 2 versions", "synced to v8". Keep it subtle, never themed or skeuomorphic.

## Vocabulary (use these words in UI copy)

- datum / current truth: the live contract registry
- epoch: a contract version (v8)
- delta: a change to a contract
- fence: a blocked stale write
- advisory: the per-recipient explanation of a delta
- blast radius: the set of sessions/files a delta affects
- ledger: the append-only decision history
- claim: a session's declared scope (files, modules)

## Anti-patterns (do not do these)

- No generic admin dashboard: no grid of KPI tiles and donut charts as the home screen. The four fleet metrics are a quiet strip, not the point.
- No swim lanes or trace waterfalls on the Tower home. Those belong to observability tools and to the Replay view only.
- No robot or cartoon agent avatars. Sessions are human-plus-agent units, shown as initials.
- No rainbow event coloring. Follow the color discipline above.
- No red except true breakage. Scarcity is what makes it legible.
- No skeuomorphic radar/map theming. The surveying language stays in microcopy, not in chrome.

## Tower drift-state wireframe (reference)

```
+-----------------------------------------------------------------------+
| ⌖ datum   acme/workspaces                      [drift · 1 reconciling] |
| epoch  o----o----o(v7 12:55)----●(v8 · live · 14:02)                   |
+----------------------------------------+------------------------------+
| DRIFT CARD                             | CURRENT TRUTH                |
| contract delta · db.users v7→v8  14:02 | db.users        [A][B]  v8  |
| [detected 0.3s][fenced 5.8s]           | api.GET /users  [B][C]  v3  |
| [advised 6.4s][reconciled 2/2][PR open]| deps.db-driver  [A]     v2  |
| asha: "phone signups make email the    +------------------------------+
| wrong name." users.email→contact_email | LEDGER                       |
|        ┌─ ben · routes/users.ts  ✓     | #112 14:02 asha · rename ... |
|  (v8)──┤                               | #111 13:41 chen · zod ...    |
|        └─ chen · UserCard.tsx    ✓     | #110 13:18 ben · 202 ...     |
+----------------------------------------+------------------------------+
| ⌖ all sessions synced to v8 · 3 agents live · last delta 4m ago       |
+-----------------------------------------------------------------------+
```

## What to design first

1. Tower home, desktop 1440, dark: calm state and drift state as two screens.
2. The drift card as an isolated component sheet: collapsed, expanded, all five lifecycle stages.
3. Registry screen with presence and a version diff.
4. TV mode variant of the Tower drift state.
Use the sample data verbatim. Realistic data over lorem ipsum everywhere.
