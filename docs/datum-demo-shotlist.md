# Datum demo shotlist

The 60-second submission video. Terminal-first. The fence firing and the agent self-correcting is the money shot; everything else supports it. The tower is observability b-roll, not the spine, and the closing proof is the real spec PR, because a dashboard does not open PRs.

> **Companion:** a self-playing reel of this exact arc, built from the real components, lives at `web/reel/` (open `web/reel/index.html` and hit play, or the deployed URL). Hit play and voiceover; Space pauses, ←/→ step scenes, C toggles captions.

Sample data is the workspace-invites scenario, used verbatim (see CLAUDE.md). Keep the elapsed-time numbers honest; only the wall-clock pacing of the edit is compressed in the cut. Voiceover lines below double as on-screen captions, so use whichever you prefer.

## What to capture (the raw clips)

You are recording five things, then cutting them into the arc below.

1. asha's terminal: the rename prompt and migration 0042 running. (data layer, branch asha/schema)
2. ben's terminal: the agent drafting a query that selects .email, the fence deny with its reason, then the self-correction to contact_email. This is the shot. Record it full size and several times, keep the cleanest take.
3. chen's terminal: the different, file-specific advisory landing for UserCard.tsx. (frontend, branch chen/ui)
4. The tower in a browser: two brief moments only, the epoch strip ticking v7 to v8, and the final "all sessions synced to v8".
5. The GitHub PR: the real PR #14 that patches docs/spec.md.

Optional end card: a title with the tagline and npx datumctl init. A plain slide is fine, or reuse the tower header.

## Setup for legibility

- Terminal font at 18 to 22pt. The embedded player is small and the fence reason has to be readable.
- A split or tiling layout (tmux, iTerm panes, or your tiling window manager) so asha, ben, and chen can sit on screen together for the cold open. Record ben's pane on its own, full size, for the fence beat.
- Capture at 1080p or higher; the player downscales.
- Seed the workspace-invites repo with the v7 schema (users.email), the routes, and the UserCard component, so there is a real contract to break.
- Sequence ben's task so his next edit has to touch users.email right after asha's migration. Prompt sequencing is your determinism lever.
- Record each beat as its own clean clip rather than one risky continuous take, then assemble.

## The 60-second cut

| Time | Screen | What happens | Voiceover or caption |
|---|---|---|---|
| 0:00 to 0:07 | Three terminals (asha, ben, chen) | All three agents working the same feature at once | "Four engineers, four Claude Code agents, one feature. They start aligned." |
| 0:07 to 0:17 | asha's terminal, then a glance at the tower | asha renames users.email to contact_email and runs migration 0042; the epoch strip ticks v7 to v8 | "Then asha renames a column and runs the migration. Datum sees it in 0.3 seconds." |
| 0:17 to 0:35 | ben's terminal, hold here | ben's agent drafts SELECT id, email and is fenced; the deny reason names the contract, the change, and asha; the agent re-syncs and writes contact_email | "Ben's agent never gets to write the broken query. The fence blocks it, tells it exactly why, and it fixes itself. No human in the loop." |
| 0:35 to 0:46 | ben's and chen's advisories side by side | the two advisories are different, each written for that person's file | "Opus 4.8 writes each teammate a fix for their own file. Two people, two different advisories." |
| 0:46 to 0:55 | GitHub PR #14 | the real PR patching docs/spec.md, three branches merging clean | "And it opens a pull request that updates the spec, so the living truth stays living. A dashboard cannot do that." |
| 0:55 to 1:00 | end card, or tower at "synced to v8" | tagline and install command | "Git coordinates code at rest. Datum coordinates agents in motion. npx datumctl init." |

Hold the fence deny on screen for three to four seconds so it can be read. That single frame is the demo.

## Exact strings to show (verbatim)

- The change: users.email to contact_email, migration 0042, asha.
- The fence reason: "db.users.email was renamed to contact_email (migration 0042, asha, 40s ago). Re-sync to v8 and use contact_email."
- Advisory to ben (routes/users.ts): users.email is now contact_email (migration 0042, asha); your open diff selects .email in two queries, update both before your next write.
- Advisory to chen (UserCard.tsx): UserDTO.email renamed, regenerate types from the API client; UserCard.tsx line 18 reads user.email and will break at runtime.
- Lifecycle, kept honest: detected 0.3s, fenced 5.8s, advised 6.4s, both reconciled by 14:03:40, spec PR #14 at 14:04.
- The contracts: db.users v8, api.GET /users/:id v3, api.POST /invites v1, deps.db-driver v2.

## Honesty rules

- The elapsed-time numbers in any chip stay the real numbers. Only the wall-clock pacing of the cut is compressed; you are showing a time-lapse and the labels say so.
- Do not stage the fence. It is a real PreToolUse deny on a real version mismatch. If a take fails, record it again, do not fake it.
- Show real code and real output. The judges score what your team built, so the terminal and the PR carry the proof, not the chrome.

## If you make finalist (the 3-minute stage cut)

The submission video is the 60-second cut above. For the live stage demo you have room to add:

- The counterfactual first: the same scenario with datum uninstalled, ending in a broken merge, so the room feels the pain before the fix.
- The live run, pure event-driven. The early cluster (detected, fenced, advised) lands in about six seconds, which reads well on a projector. Narrate over the roughly 80-second reconcile gap; when ben and chen reconcile, the tower resolves on its own, which is your "it fixed itself while I was talking" moment.
- Open the spec PR live. A dashboard does not open PRs, and that point lands hardest in person.
- Keep prefers-reduced-motion on as jank insurance on the venue machine, and keep one clean recorded run as the backup if the live run fails.

## Live capture helpers (real, reproducible)

- The deterministic full arc, guaranteed clean: `node demo/datum-demo.ts` (the headless gate, exits 0 with the six predicates) — good b-roll / backup.
- The real fenced agent (the money shot on a real session): `node demo/live-bus.ts` (seeded bus at v8) + a workspace in the behind-state, then a real `claude -p` edit that touches `.email` gets the PreToolUse deny and self-corrects.
- The tower at v8: https://datum-tower.pages.dev
- The real spec PR: https://github.com/suraj-phanindra/datum-workspace-invites/pull/1
