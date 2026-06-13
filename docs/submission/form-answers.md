# Datum — submission form answers

Drafted from the real build artifacts (not speculation): the deterministic fence, the watchlist, the hooks, and the arbiter's logged, live Opus 4.8 advisories.

---

## 1. How did you use Opus 4.8?

Opus 4.8 is Datum's **arbiter**, and we put it deliberately **off the critical path**. Correctness — drift detection and the write-fence — is 100% deterministic and runs with the model disabled: a path-and-parser watchlist bumps a monotonic registry version on any contract-surface edit, and a `PreToolUse` hook denies a stale write via a pure set-intersection function. The fence completes in well under 50ms on a cache hit with **zero model calls**; our test suite asserts "the fence fires with the arbiter disabled."

Opus 4.8 adds the judgment a deterministic check can't. After a delta is detected, the arbiter first computes the intersecting set deterministically — which teammates' *claimed scope* touches the change — and sends **only the intersecting pairs** to `claude-opus-4-8` on a cached prefix: the delta plus that one teammate's intent manifest, nothing global. It returns a **per-recipient advisory rewritten for that teammate's specific in-flight file and task**, and opens a PR that patches the spec to the new contract.

The proof it's an arbiter, not a notifier: from the single delta `users.email → contact_email`, Opus 4.8 produced **two different advisories** — to ben (`routes/users.ts`): "your open diff selects `.email` in two queries; update both before your next write"; to chen (`UserCard.tsx`): "regenerate types from the API client; `UserCard.tsx` line 18 reads `user.email` and will break at runtime." Same fact, two tailored explanations. That output is a real, logged Opus 4.8 call captured during the build, not a fixture. The arbiter is model-agnostic — a one-line swap — so it slotted onto Opus 4.8 when Fable 5 was suspended.

## 2. How did you orchestrate the agents / the build?

The load-bearing principle: **keep the model off the critical path — correctness is deterministic and instant; the model adds judgment, not latency.** That split shaped both the product and how we built it.

**The product's fast-path / slow-path orchestration:**
- **Detect (fast, no model):** contract truth lives on known surfaces — DB schemas, API shapes, dep versions, decisions. A `PostToolUse` hook streams every edit to a shared bus; a path + light-parse check flags contract-relevant changes in milliseconds and bumps a monotonic version.
- **Protect (fast, no model):** each session tracks its last-synced version. A `PreToolUse` hook does a version check + set intersection and **denies a stale write before it executes** (or injects the mechanical delta). Hooks are the orchestration substrate: coordination becomes a checkpoint the agent *cannot ignore* (unlike a stale markdown file), enforced at the tool-call boundary — every write is a tool call, so every write is an interception point. The deny is evaluated before any permission-mode check, so it holds even under `bypassPermissions`.
- **Judge (slow, async, Opus 4.8):** the arbiter runs server-side via a queue and never gates a write.

**The moment it earned its keep:** ben's agent, mid-task after asha's migration, went to write `routes/users.ts` still selecting `.email`. The fence denied it with a reason naming the contract, the mechanical change (`email → contact_email`), the migration (0042), and the author (asha). The agent read that reason and, on its **next action**, rewrote the query to `contact_email` — it self-corrected with **no human input**. Both consumers reconciled and three branches merged clean.

**We dogfooded the same orchestration to build Datum.** We froze one shared schema, then ran an **anti-drift critic** over 12 PRDs authored by parallel agents — it caught 7 integration seams (an unowned `reconciled` emitter, a missing re-sync write-back, an ambiguous epoch-bump rule) *before a line of code was written*: exactly the merge-time drift Datum exists to prevent. We then built feature-by-feature with parallel implementer agents and an adversarial verifier on every step — the verifier caught a real bug where a hook shipped only an edit's first line, so the schema parser missed the rename and the fence wrongly allowed the write. Deterministic core, model for judgment, verify everything.
