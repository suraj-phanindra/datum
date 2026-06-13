# Datum rubric

Acceptance criteria for the build, written so the model can grade itself without a human. The headless `datum demo` script plus the unit tests below are the verifier. This file is also the orchestration artifact for the submission: "done" is a test suite, a responding URL, and a script the model can run and check.

## How to verify (the model-gradable check)

- `npm test` passes. Unit tests cover: the watchlist parser (a schema edit is flagged contract-relevant, a README edit is not), the monotonic version bump, the set-intersection fence decision (a write inside a fresh delta's scope is denied, a write outside it is allowed), and the advisory output shape.
- `datum demo` runs the workspace-invites scenario headless and asserts, exiting 0 only if all hold: registry advances to v8, exactly one write is fenced, two advisories are delivered, the two advisories differ, one spec PR is opened, three branches merge clean.
- The live URL returns 200 and shows the registry at v8.

If those three pass, the core product is real.

## Core protocol (must pass)

- SessionStart registers a session and injects the current registry snapshot into the agent's context.
- PostToolUse streams an edit to the bus; an edit on a contract surface bumps the monotonic registry version; an edit off the watchlist does not.
- PreToolUse denies a write that targets a contract changed since the session's last sync, and the deny reason names the contract, the mechanical change, and the author.
- A fenced agent reads the reason and self-corrects on its next action with no human input.
- The arbiter produces two different advisories for two different recipients from one delta, each written for that recipient's file and task.
- The arbiter opens a real PR that patches docs/spec.md to the new contract, with a linked ledger entry.

## Determinism and latency (must pass)

- The fence fires with the arbiter disabled. Correctness does not depend on the model.
- The fence check completes under ~50ms on a cache hit (HTTP only on version mismatch).
- If the bus is unreachable, the hook fails open and the agent keeps working, with a warning surfaced on the dashboard. No agent is ever bricked.

## Demo (must pass)

- The full workspace-invites scenario runs start to finish on three real Claude Code sessions.
- The epoch strip ticks v7 to v8 and the drift card animates through detected, fenced, advised, reconciling, reconciled, patched.
- A live URL responds and reflects the current truth.

## Not-a-dashboard check (must pass)

- With the web app stopped, the scenario still works: the fence fires, the advisory injects, the spec PR opens. The terminal path is the product; the dashboard only reflects it.

## Submission readiness

- Repo is public and extractable as a standalone project.
- 1-minute video is terminal-first, opens on the agents and the fence, shows the spec PR, and stays under a minute.
- Session log exported via `/export` and linked.
- The "how Opus 4.8 was used" and orchestration answers are written from the real artifacts, not speculation.

## Nice to have (do not block on these)

- Stop hook prevents an agent from declaring done while unacknowledged deltas intersect its diff.
- The counterfactual run without Datum, ending in a broken merge, for the video contrast.
- Install demoed live on a judge's laptop with the first-event panel streaming.
