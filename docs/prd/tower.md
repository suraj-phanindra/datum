## the web tower (read-only)

The tower is observability on top of the protocol: it renders shared truth a single cockpit cannot see. It reads the bus, never writes it. Killing it changes nothing in the terminal path.

### Visible behavior
A viewer opens the live URL and sees the drift-state home from `datum_tower_drift_state.html`, hydrated from real data: the `⌖ datum · acme/workspaces` header with a `drift · 1 delta reconciling` pill; the **epoch strip** spine ticking `v7 · 12:55` → `v8 · live · 14:02` (amber); the **drift card** (`contract delta · db.users v7 → v8`, 14:02:11) with lifecycle chips (detected 0.3s, fenced 5.8s, advised 6.4s, reconciled 2/2, spec PR open), asha's quote `"phone signups make email the wrong name."` and mono `users.email → contact_email, migration 0042`, plus the blast-radius SVG (ben · routes/users.ts, chen · UserCard.tsx); the **current truth** registry rail with presence avatars and per-contract versions; the **ledger** (#112/#111/#110); and the fleet footer `all sessions synced to v8 · 3 agents live`. When an edit hits the bus, it drives the epoch and card live via SSE, no refresh.

### Interface / contract
The tower is a pure consumer of schema §4 endpoints. On load it fetches `GET /registry` → `{ registry_version, contracts: Contract[] }` and `GET /deltas?since=7` → `{ deltas: Delta[] }`. It then subscribes to `GET /stream` (SSE of `Event`) and routes by exact `type` string — `delta.detected`, `write.fenced`, `advisory.delivered`, `reconciled` (per-session and `workspace:true`), `spec.pr.opened` — to update epoch, chips, blast-radius nodes, and footer. It renders `Advisory` (§6) and `MechanicalChange` (§5) verbatim. It calls **no** mutating endpoint (`POST /events`, `/decide`, `PATCH /sessions/:id`) and invokes neither `decideFence`, `classifyEdit`, nor `bumpRegistry`. `tokens-shim.css` aliases mockup `--color-*` (e.g. `--color-background-danger`, `--color-text-warning`) onto shipped `--signal-*`/`--surface-*`/`--text-*` tokens so markup lifts verbatim under strict color discipline.

### Acceptance test
`test/tower.test.ts` asserts that the live URL returns 200 and shows the registry at v8. With a seeded bus running, start `web/serve.ts`, `GET /` asserts HTTP 200, and the served HTML/hydration asserts the rendered epoch reads `v8` and the `db.users` row reads `v8`. A second case asserts the not-a-dashboard property: with `web/serve.ts` stopped, the demo-runner fence/advisory/spec-PR assertions still pass.

### Files it touches
`web/serve.ts`, `web/index.html`, `web/tower.js`, `web/tokens-shim.css`, `test/tower.test.ts`.

### Open questions / risks
- Depends on bus-registry `/stream` and `/registry` (track A); drift-card-animation (#9) layers onto the same single render path.
- Static/seeded snapshot fallback for deploy (#11) without forking the render path.
- SSE reconnect/replay-from-`since` on drop so a late viewer still lands on v8.

---
### Reconciliation (binding, post-critic)
- **Sole owner of `web/serve.ts`, `web/tower.js`, `web/tokens-shim.css`.** drift-card-animation *consumes* `tower.js` (SSE router) + `tokens-shim.css`; deploy adds its seeded-snapshot fallback to `serve.ts` behind a scoped flag, coordinated here — neither forks the render path.
- Disambiguate the two `reconciled` events on `payload.workspace === true`, not on the type string.
