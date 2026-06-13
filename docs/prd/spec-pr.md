## spec-patch PR + ledger entry

The arbiter's second, slow-path output: once advisories are delivered for a `delta.detected`, patch the seed repo's `docs/spec.md` to the new contract truth, open a real PR, and link a ledger entry. This closes the loop from "truth changed" to "the written spec now agrees." Strictly off the critical path: it runs in the arbiter queue after the fence has already fired.

### Visible behavior
On camera: after ben is fenced and the two advisories land, a PR appears (GitHub `gh` PR **#14**, or a local PR artifact branch + `pr.json` when no remote). Its diff rewrites `docs/spec.md`: `users.email` → `contact_email`, noting migration **0042**. The tower's drift card advances to the `patched` state; the existing ledger row **#112** ("rename users.email, phone signups landing", asha, 14:02) is linked to the contract. The PR body cites the delta (db.users v7→v8) and the ledger id.

### Interface / contract
`openSpecPR(delta: Delta, ledgerId: number) → { pr_number, url, contract_id, epoch, ledger_id, patch_path }`. Consumes the `delta.detected` payload (schema §3: `epoch, contract_id, from_version, to_version, author, ts, why, mechanical_change`) and the `MechanicalChange` (`rename_column` table=users, from=email, to=contact_email, migration=0042). On success emit event `spec.pr.opened` with payload `{ pr_number, url, contract_id, epoch, ledger_id, patch_path }`, `patch_path: "docs/spec.md"` (schema §3). No `bumpRegistry`/`classifyEdit`/`decideFence` call: this never moves the epoch and never gates a write.

### Acceptance test
`test/spec-pr.test.ts`. Satisfies RUBRIC: "The arbiter opens a real PR that patches docs/spec.md to the new contract, with a linked ledger entry" (and the `datum demo` clause "one spec PR is opened"). Assertions: given the hero delta, `openSpecPR` produces a patch that removes `email` and adds `contact_email` in `docs/spec.md`; the linked `LedgerEntry` (#112) exists with `contract_id === "db.users"`; exactly one `spec.pr.opened` event is emitted with `patch_path === "docs/spec.md"`, `epoch === 8`, and a non-empty `pr_number`/`url`. Runs with the web app stopped (not-a-dashboard).

### Files it touches
`server/arbiter/spec-pr.ts` (openSpecPR, gh + local-artifact fallback, emits `spec.pr.opened`); `test/spec-pr.test.ts`; reads `demo/workspace-invites/docs/spec.md` (the patch target).

### Open questions / risks
Sequencing: depends on `arbiter` (#6) and the existing ledger #112; must fire only after `advisory.delivered`. `gh` may be absent/unauthenticated in CI — default to the local PR artifact (branch + patch + `pr.json`) so the test is deterministic offline (note: `gh` *is* authenticated on this machine, so the live demo can open a real GitHub PR).

---
### Reconciliation (binding, post-critic)
- **`openSpecPR(delta, ledgerId)` LINKS the existing ledger #112** (created by bus-registry at delta detection); it **does NOT** call `POST /decide` to create it. The `ledgerId` is an input, looked up from the delta's epoch/contract.
- **Idempotent:** repeated demo runs must not open duplicate PRs or double-write the ledger. Prefer the local PR artifact for deterministic offline tests; the live demo may use `gh`.
