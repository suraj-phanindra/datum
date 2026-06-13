# Datum build plan

Phased sequence for the build day, four engineers, mapped to the event schedule (hacking 10:30, lunch 1:00, submissions 5:00, finalists 6:15). This file is also the orchestration story for the submission: simple, repeatable, and verifiable by the model via the headless check in RUBRIC.md.

## Ownership

Four parallel tracks, one owner each. They integrate at the checkpoint before lunch.

- A: bus + registry. The event log, the contract registry with a monotonic version, the contract-surface watchlist parser, the SQLite store.
- B: hooks client + installer. datum-fence (PreToolUse), datum-claim (PostToolUse), datum-join (SessionStart), and `npx datum init` that writes the hooks block into .claude/settings.json and the hook scripts into .claude/hooks/.
- C: arbiter. The set-intersection "which changes break whom", the per-recipient advisory generation (Opus 4.8, async), and the spec-patch PR.
- D: dashboard + demo. The tower (epoch strip and drift card real and animated, rest static), the workspace-invites seed repo, the scripted emitter for the video, and the demo script.

## Phase 0, setup (10:30 to 11:00)

- Confirm Opus 4.8 access with one cheap API call. Do not discover a model-access surprise later.
- Confirm the hook JSON schema against docs.claude.com/en/docs/claude-code/hooks.
- Scaffold the repo per the structure in CLAUDE.md. Make it public now.
- Agree the event schema and data model together (15 minutes, write it down), so the four tracks do not drift on field names. This is your own dogfood moment: the team is about to coordinate four agents.
- D seeds the workspace-invites repo with the v7 schema (users.email), the routes, and the UserCard component, so there is a real contract to break.

## Phase 1, the spine (11:00 to 1:00, parallel)

- A: contract-surface write bumps a monotonic registry version; events persist; a `GET /version` and `GET /registry` respond.
- B: the three hooks installed via the installer; SessionStart pulls the snapshot and injects it; PostToolUse streams an edit to the bus.
- C: stub the arbiter end to end first (intersection returns the right sessions, advisory is a templated string), so the pipeline is whole before the model is good.
- D: the tower renders the epoch strip and a static drift card from seeded data; the scripted emitter can fire the lifecycle events.

Checkpoint before lunch (around 1:00): a real edit on the seed repo bumps the registry and the dashboard ticks v7 to v8. The spine is connected end to end, even if rough.

## Phase 2, the real behavior (1:30 to 3:00)

- The fence fires on a genuine version mismatch: ben's agent, mid-task on routes/users.ts after the migration, attempts an edit selecting .email and gets a PreToolUse deny with a reason naming the contract, the change, and asha. The agent self-corrects on its next action.
- The advisory injects: chen's session receives a different, file-specific advisory.
- C swaps the templated advisory for the real Opus 4.8 call (scoped to intersecting pairs, cached prefix) and opens a real PR to docs/spec.md.
- Run the full workspace-invites scenario on three real sessions until it works start to finish and three branches merge clean.

## Phase 3, polish (3:00 to 3:30)

- Finish the drift card animation per the spec and the reference HTML: epoch tick, blast radius node flips (ben neutral to red to green, chen neutral to blue to green), lifecycle chip progression, card birth. Ripple, header tint, settle pulse, footer slide are polish.
- Wire the metrics strip. Make the calm state genuinely calm.
- If demoing the install live on a judge's laptop, make the SessionStart first-event panel stream.

## Feature freeze 3:30

Stop building features. Everything after this is recording, writing, and deploying.

## Submission (3:30 to 5:00)

- Record the 1-minute video, terminal-first, per docs/datum-demo-shotlist.md. The fence and self-correction is the shot; record it several times, keep the cleanest.
- Draft the two form answers that needed the real build: how Opus 4.8 was used (foreground the arbiter's scoped judgment and the per-recipient advisories), and the orchestration answer (the contract-surface watchlist, the fast-path slow-path split, the hooks as verifier checkpoints, and the moment the fenced agent corrected itself). Link this BUILD_PLAN and the RUBRIC as your workflow files.
- Run `/export` from Claude Code, commit the session log, link it.
- Deploy the tower to a live URL. Confirm it returns 200 and shows v8.
- Make sure the repo is public and the project is extractable as a standalone.
- Submit by 5:00 with buffer.

## If finalist (after 6:15)

Rehearse the 3-minute live cut at least five times and record the best run as backup. Live mode is pure event-driven; narrate over the roughly 80-second reconcile gap, and let the card resolve on its own when ben and chen reconcile. Open the spec PR live: a dashboard does not open PRs, and that point lands.

## Risk notes

- Conference wifi only hurts the model calls; the bus is localhost. Have a phone hotspot.
- Sequence ben's tasks so his next edit must touch users.email right after the migration. Prompt sequencing is your determinism lever.
- prefers-reduced-motion is your jank insurance on an unfamiliar machine; the animation must read with motion off.
- Keep one clean recorded run of the whole scenario as the video backup in case the live run fails.
