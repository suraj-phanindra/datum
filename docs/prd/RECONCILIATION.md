# RECONCILIATION — anti-drift critic pass (binding)

The Phase-1 critic read `schema.md` + all 12 PRDs together and flagged **7 blocking** integration seams (the exact drift Datum prevents). Each is resolved below; the binding contract changes are folded into [`schema.md`](./schema.md). Where a PRD's prose conflicts with this file, **this file + schema.md win**.

## Resolutions

| # | finding (type) | resolution (binding) | owner |
|---|---|---|---|
| 1 | **Live `reconciled` emission unowned** (gap) | The server emits per-session + workspace `reconciled` on the real path, inside `POST /events`, when a previously-fenced session lands a clean write (re-checked via `decideFence` → `allow`). The emitter's `reconciled` is a test/video scaffold only. | **bus-registry** owns + emits; self-correction & drift-card *consume* |
| 2 | **`last_synced_version` never advanced** (gap) | `datum-claim` calls `PATCH /sessions/:id` after each successful round-trip and writes `last_synced_version` back to `.datum/state.json`. This clears the fence/stop-guard fast path after a reconcile. | **hooks-installer** (datum-claim) |
| 3 | **"Three branches merge clean" parked as open question** (gap) | It is a **committed predicate**: `datum demo` performs a real `git merge` of `asha/schema`, `ben/api`, `chen/ui` onto `contact_email` and asserts no conflict. Three branches are a real fixture in the seed. | **demo-runner** |
| 4 | **`POST /decide` epoch semantics** (contradiction) | `/decide` is **epoch-NEUTRAL**: appends a `LedgerEntry`, returns the *current* `registry_version` unchanged. Only contract-surface `POST /events` bumps. | **bus-registry** |
| 5 | **reconcile correlation key** (contradiction) | Correlation = `session_id` + `contract_id`. `path` is carried on the per-session `reconciled` for UI but is **not** the key. | schema §3 |
| 6 | **ledger #112 double-claimed** (contradiction) | Seed loads `#110` + `#111` only (explicit ids). `#112` is created **live** by bus-registry when asha's delta is detected (delta `why` → ledger). `spec-pr` **links** #112; it does **not** `POST /decide` to re-create it. | bus-registry creates; spec-pr links |
| 7 | **`openSpecPR` ledgerId in/out** (schema conflict) | `openSpecPR(delta, ledgerId)` receives the existing #112 and **links** it; it never calls `POST /decide`. | **spec-pr** |
| — | camelCase vs snake_case (`contractId`↔`contract_id`) | In-process TS = camelCase; wire/events = snake_case. Map explicitly at the boundary. (schema §5) | all tracks |
| — | stop-guard reusing `write.fenced` | Stop guard **blocks locally only, emits no bus event** (would corrupt "exactly one write fenced"). P3/stretch. | stop-guard |

## Ownership matrix (sole author per shared file — resolves merge races)

| file | **sole author** | contributors (read/snippet only) |
|---|---|---|
| `cli/init.ts` | **hooks-installer** | mcp-server (MCP registration snippet) + stop-guard (Stop matcher) via an **idempotent merge helper**, never direct edits |
| `hooks/datum-fence.ts` | **fence** | self-correction & hooks-installer *consume* `decideFence`; do not fork the reason copy |
| `server/fence.ts` | **fence** | hooks-installer, stop-guard import `decideFence` |
| `web/serve.ts` | **tower** | deploy adds the seeded-snapshot fallback behind a scoped flag, coordinated with tower |
| `web/tower.js`, `web/tokens-shim.css` | **tower** | drift-card-animation *consumes* (read deps) |
| `demo/scenario.ts` | **demo-runner** | self-correction contributes the ben `.email`→`contact_email` two-step as a defined section |
| `server/{bus,registry,watchlist,store,db,index}.ts` + `reconcile` | **bus-registry** | everyone else reads via HTTP |

## Sequencing gates (from the critic)

1. **bus-registry ships live `reconciled` emission + the resync write-back BEFORE the 3-session live run.** The demo-runner stub stays a strictly-flagged early scaffold; an integration test asserts the *live server* (not the emitter) emits `reconciled`.
2. **The real arbiter + real spec-pr are exercised by their own acceptance runs** (`test/advisory-shape.test.ts` with a low-temp/fixtured Opus call; `test/spec-pr.test.ts` opening a gh-or-local-artifact PR) — the static replay that makes the headless demo exit 0 must never be the *only* proof of RUBRIC lines 19–20.
3. **`web/snapshot.json` for deploy is regenerated only AFTER arbiter + spec-pr event payloads are frozen**, with a check that `registry_version === 8` and the replay contains all six event types through `spec.pr.opened`.

**Overall critic assessment:** the 12 PRDs were largely well-aligned to the frozen schema (signatures, endpoints, event strings cited verbatim; not-a-dashboard honored). Drift concentrated at integration seams each parallel author assumed someone else owned. With the above folded in, the contract holds. Proceeding to build.
