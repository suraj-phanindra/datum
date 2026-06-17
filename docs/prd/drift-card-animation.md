## LiveDriftCard animation state machine

### Visible behavior
Scenario: the Tower opens calm. `db.users` is a one-line feed row "synced to v7"; the epoch strip's amber live marker sits on v7. A delta fires (real agent edit, or scripted emitter in compressed playback). The epoch strip ticks: a v8 amber node appears, the live marker advances v7→v8 (`epoch.tick`, 480ms). The feed row expands into the full drift card with one amber ripple (`card.expand` 420ms; `ripple` 640ms, single). The `detected 0.3s` chip saturates amber; later chips render as gray ghosts. asha's why fades in, `users.email` gets a left-to-right strikethrough, `→ contact_email`. Blast radius draws: center `db.users v8` amber (one pulse), `ben · routes/users.ts` and `chen · UserCard.tsx` neutral outlines, two connecting lines staggered 80ms. Then ben's node punches to red with a lock (`node.fence` 200ms overshoot), header tints red, `fenced 5.8s` chip activates. chen's node turns blue (`advised 6.4s`). The reconcile chip counts 0/2→1/2 (ben→green, check) →2/2 (chen→green); a single green settle pulse, header eases green. Finally `spec PR open 14:04` appears and the footer slides up: "spec PR #14 · docs/spec.md · ledger #112". After a 2-3s beat the card auto-collapses to a green-checked resolved feed row. Honest elapsed-time labels stay real even in compressed mode.

### Interface / contract
The card is a pure render-from-state machine; state advances only on `Event` objects (schema §2) consumed from `GET /stream` (SSE) in live mode or an identical scripted emitter in compressed-playback mode. Event→state map (schema §3): `delta.detected`→detected (reads `from_version`/`to_version`, `author`, `why`, `mechanical_change`), `write.fenced`→fenced (`human`, `path`, `contract_id`), `advisory.delivered`→advised (`Advisory.recipient`/`file`/`severity` per §6), `reconciled` per-session→increments the 0/2 count, `reconciled` workspace→reconciled, `spec.pr.opened`→patched (`pr_number`, `patch_path:"docs/spec.md"`, `ledger_id`). It renders only; it never calls `decideFence`, `classifyEdit`, or `bumpRegistry`. Initial epoch read from `GET /registry` (`registry_version`). Severity drives node color: `fence`→red, `advisory`→blue.

### Acceptance test
`test/drift-card.test.ts` (JSDOM). The acceptance check asserts that the drift card animates through detected, fenced, advised, reconciling, reconciled, and patched. Feeding the verbatim §9 event sequence, it asserts the machine transitions through all seven states (calm→…→patched) in order; the ben node reaches red then green and chen blue then green; the count reads 2/2; and the footer exposes PR #14 / ledger #112. A `prefers-reduced-motion` assertion confirms final colors/labels/count are correct with zero animation.

### Files it touches
- `web/drift-card.js` (the `LiveDriftCard` state machine + render)
- `web/anim.css` (animation tokens, reduced-motion + TV-mode rules)
- `test/drift-card.test.ts`
- *consumes* `web/tower.js` SSE wiring and `web/tokens-shim.css` (owned by tower #8 — read deps, not co-authored)

### Open questions / risks
- Depends on tower (#8) for the SSE client and the `--color-*`→`--signal-*` token shim; sequence after it.
- Live reconcile gap (~80s) is real dead air — narrate, do not fake (spec §"Two run modes"). Compressed (~8s) timeline is video-only with honest elapsed-time chip labels.

---
### Reconciliation (binding, post-critic)
- **Disambiguate the two `reconciled` events on `payload.workspace === true`**, never on the type string, or the count + final state break.
- **Read-only consumer of `web/tower.js` + `web/tokens-shim.css`** (tower is sole author). Authors only `web/drift-card.js`, `web/anim.css`, `test/drift-card.test.ts`.
- Animation tokens are exact from `docs/datum-drift-card-animation-spec.md`: `card.expand` 420ms cubic-bezier(.16,1,.3,1), `epoch.tick` 480ms cubic-bezier(.65,0,.35,1), `node.fence` 200ms cubic-bezier(.34,1.56,.64,1) (the one overshoot), `settle.pulse` 520ms, `footer.slide` 300ms.
