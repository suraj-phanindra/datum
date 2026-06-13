## deploy tower to a live URL

Deploy the read-only tower (feature #8) to a public URL so judges can open it and see Datum's current truth. Static-friendly: when no live bus is reachable, the tower hydrates from a seeded snapshot baked at deploy time. The protocol is the product; this view only reflects it. Deleting this deployment leaves the fence, advisories, and spec PR fully working in the terminal path.

### Visible behavior
On camera: open the live URL in a browser. The page returns 200, the epoch strip reads **v8**, and the `current truth` registry rail shows `db.users` at **v8** alongside `api.GET /users/:id` v3, `api.POST /invites` v1, `deps.db-driver` v2. The drift card renders its settled (`reconciled`/`patched`) state for the `users.email → contact_email` (migration 0042, asha) hero delta. No terminal, no live bus required for the page to render. If a live `DATUM_BUS_URL` is configured, the same page upgrades to live `/stream` SSE; otherwise it shows the seeded snapshot.

### Interface / contract
The deployed tower consumes the same schema §4 surfaces it would locally: `GET /registry` → `{ registry_version, contracts: Contract[] }` and `GET /stream` SSE of `Event`. The seeded fallback is a verbatim serialization of that `GET /registry` response (`registry_version: 8`, the four `Contract` rows) plus a frozen replay of `Event`s (`delta.detected`, `write.fenced`, `advisory.delivered` ×2, `reconciled` ×2 + workspace, `spec.pr.opened` #14) so the drift-card state machine (schema §3) reaches `patched` without a server. No new types, endpoints, or event strings are introduced; `decideFence`/`classifyEdit`/`bumpRegistry` are untouched (they live on the terminal path and are not deployed here).

### Acceptance test
`test/deploy.test.ts`. Satisfies RUBRIC: "The live URL returns 200 and shows the registry at v8." The test fetches the deployed URL (or the built static artifact served locally), asserts HTTP 200, asserts the served snapshot JSON parses to `registry_version === 8`, and asserts a `db.users` contract with `current_version === 8` is present. A second assertion confirms the not-a-dashboard line: the snapshot is static (no bus process running during the fetch).

### Files it touches
`web/deploy.config.json` (host/build config), `web/snapshot.json` (seeded v8 `GET /registry` + frozen event replay), `demo/seed-snapshot.ts` (generates `snapshot.json` from the seed), `test/deploy.test.ts`. *Contributes* the snapshot fallback branch to `web/serve.ts` (tower is sole owner — coordinated, behind a flag).

### Open questions / risks
- Host choice (Cloudflare Pages / Vercel / Railway) affects `deploy.config.json`; pick one and freeze before recording.
- SSE over the chosen host: confirm streaming is allowed, else ship snapshot-only on the live URL and demo live SSE locally.

---
### Reconciliation (binding, post-critic)
- **`web/snapshot.json` is regenerated only AFTER arbiter + spec-pr event payloads are frozen** (RECONCILIATION gate 3). A check asserts `snapshot.registry_version === 8` and that the replay contains all six event types through `spec.pr.opened` #14.
- **`web/serve.ts` is tower-owned**; deploy's snapshot fallback is a scoped flag/branch, not a fork of the render path.
