# Orchestration scripts

The actual multi-agent workflow scripts the lead (Opus 4.8) authored and ran via the Workflow tool to build Datum. Each is a deterministic JavaScript pipeline that fans out parallel agents and then grades the result with an **independent, adversarial verifier** (fresh eyes, re-runs the real tests, grades against the PRD + [RUBRIC](../RUBRIC.md), never trusts the implementer's claims). Run ids preserved in `git log` / [`../../session-log.md`](../../session-log.md).

The loop, every stage: **freeze the shared contract ([schema.md](../prd/schema.md)) → fan out implementers (one per track, coding against the contract) → adversarial verifier per track → lead runs the full suite + reconciles + commits.** A feature is not done until its verifier passes.

| script | what it did | what the adversarial pass caught / proved |
|---|---|---|
| `datum-phase1-prds.js` | 12 parallel PRD authors + 1 **anti-drift critic** over all PRDs + the frozen schema | 7 integration seams **before any code** (unowned `reconciled` emitter, missing re-sync, ambiguous epoch bump) — the same drift Datum prevents (dogfooding) → [RECONCILIATION.md](../prd/RECONCILIATION.md) |
| `datum-build-1-bus-registry.js` | substrate (bus + registry + watchlist + fence-helpers), implement → verify | zero-install proven; monotonic bump + watchlist parser asserted |
| `datum-build-2-fence-arbiter-tower.js` | fence ★, arbiter, tower in parallel, each verified | live Opus 4.8 produced two genuinely different advisories (not a fixture) |
| `datum-build-3-installer-specpr-anim.js` | installer, spec-pr, drift animation in parallel | **caught a real bug**: `datum-claim` shipped only an edit's first line, so the parser missed the rename and the fence wrongly ALLOWED — verdict fail until fixed |
| `datum-build-4-mcp-demo-stopguard.js` | MCP, headless `datum demo` (the RUBRIC gate), Stop guard | the demo verifier ran `datum demo` end-to-end: exit 0, all six predicates, real git merge |
| `datum-build-5-selfcorrect-deploy.js` | self-correction test + the static deploy artifact | found a test-isolation git race (later root-caused to the seed repo nesting) |
| `datum-build-cli.js` | the 19-command CLI cockpit | verifier exercised every command against a live seeded bus (exit codes, --json, fail-soft) |
| `datum-package-datumctl.js` | esbuild bundle + install-aware `init`, publishable as `datumctl` | **clean-room verifier**: a stranger's `npx datumctl init` outside the repo actually fences; caught an EADDRINUSE double-bind in the bundle |
| `datum-build-team-layer.js` | self-hosted git-native team layer | **proved**: two clones of one git remote auto-join one workspace, zero login |
| `datum-demo-reel.js` | the self-playing demo reel | a **real-browser verifier** plays it and screenshots every scene |

Scaffolding that directed the work: [CLAUDE.md](../../CLAUDE.md) (master context), [BUILD_PLAN.md](../BUILD_PLAN.md) (sequence), [RUBRIC.md](../RUBRIC.md) (definition of done), [prd/schema.md](../prd/schema.md) (the frozen contract), the per-feature [PRDs](../prd/), and [RECONCILIATION.md](../prd/RECONCILIATION.md).
