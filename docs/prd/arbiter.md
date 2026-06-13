## the arbiter (Opus 4.8, off critical path)

The judgment layer. After a contract-surface delta lands, the arbiter decides *which* teammates break and rewrites a tailored advisory for each, off the request path. It is a separate async service: the deterministic fence and version bump never wait on it, and the demo passes with it disabled.

### Visible behavior
On camera: asha's migration 0042 bumps the registry to v8 (`delta.detected`). Moments later, two distinct advisories surface in the tower's drift card and in each teammate's `additionalContext`. Ben (`routes/users.ts`, severity `fence`): "users.email is now contact_email (migration 0042, asha). Your open diff selects .email in two queries; update both before your next write." Chen (`UserCard.tsx`, severity `advisory`): "UserDTO.email renamed; regenerate types from the API client. UserCard.tsx line 18 reads user.email and will break at runtime." Same delta, two different bodies, each naming that recipient's own file. Asha (the author) gets nothing. Timing stays honest: advisories delivered ~6.4s after the delta.

### Interface / contract
Triggered async on the `delta.detected` event (epoch 8, `contract_id: "db.users"`, `mechanical_change` = `rename_column users.email→contact_email`, migration 0042, author asha) drained from a queue, never the HTTP request path. `intersect(delta, sessions)` returns only sessions whose `claim_files`/`claim_symbols` touch the delta (ben + chen hit on `.email`/`user.email`; asha excluded as author). Each intersecting pair (delta + that session's manifest) goes to `claude-opus-4-8` via the Anthropic SDK (`ANTHROPIC_API_KEY`, CLI fallback) on a cached prefix. Output is an `Advisory` (schema §6): `recipient`, `session_id`, `file`, `delta_ref {contract_id, from_version:7, to_version:8, migration, author}`, `severity: "fence"|"advisory"`, `body`, `actions[]` (≥1). The arbiter appends one `advisory.delivered` event per recipient via `POST /events` (`{ session_id, human, recipient, file, advisory }`); sessions read them via `GET /sessions/:id/advisories`. It consumes `classifyEdit` output and the `MechanicalChange`/`Delta` shapes verbatim; it does not call `decideFence` or `bumpRegistry`.

### Acceptance test
`test/advisory-shape.test.ts`. Satisfies RUBRIC: "The arbiter produces two different advisories for two different recipients from one delta, each written for that recipient's file and task." Asserts: exactly 2 advisories from the one db.users delta; `ben.body !== chen.body`; each `.file` is the recipient's file (`routes/users.ts`, `UserCard.tsx`); each `delta_ref` names db.users/email→contact_email/asha; each has ≥1 action. Also ties to "The fence fires with the arbiter disabled": a guard test stubs the arbiter off and confirms intersect/fence are unaffected.

### Files it touches
`server/arbiter/index.ts` (queue drain on `delta.detected`), `server/arbiter/intersect.ts` (deterministic recipient set), `server/arbiter/advise.ts` (Opus 4.8 call + Advisory assembly), `server/arbiter/prompt.ts` (cached-prefix prompt + per-recipient slice), `test/advisory-shape.test.ts`.

### Open questions / risks
- Depends on bus-registry for `delta.detected`, `POST /events`, `/sessions/:id/advisories`, and seeded claims.
- Model nondeterminism vs. the verbatim RUBRIC bodies: pin temperature low and assert on **structure/keywords** (recipient file, contract, author) — or seed a recorded fixture — rather than exact prose.
- `fence` severity on ben's advisory is judgment-layer prose, distinct from the deterministic `decideFence` deny — keep them consistent but never couple the fence to the arbiter.

---
### Reconciliation (binding, post-critic)
- **arbiter completion triggers spec-pr** (`server/arbiter/spec-pr.ts`); sequence arbiter → spec-pr → final demo. The arbiter itself never creates a ledger entry — #112 is born at delta detection (bus-registry).
- **Real arbiter must be proven by its own acceptance run** (low-temp/fixtured Opus call) — the demo-runner static replay is not sufficient proof of "two advisories differ" (RECONCILIATION gate 2).
