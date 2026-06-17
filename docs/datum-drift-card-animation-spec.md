# Datum drift card animation spec

The choreography the drift card moves through when a contract delta fires. Scoped to the two elements that carry the live demo: the epoch strip and the drift card. Everything else on the Tower is static. Uses the strict color discipline (gray ambient, amber contract-surface and epoch, red breaking and fences, blue advisories, green reconciled). Sample data is the workspace-invites scenario, used verbatim.

## Core principle

Motion means something happened. Every transition below is triggered by a real event arriving on the bus, never by a fixed clock. Model the card as one explicit state machine; drive it from the live bus in the demo and from a scripted emitter in the video. One render path, two event sources. Do not animate anything that is not a response to an event.

## State machine

States: calm, detected, fenced, advised, reconciling, reconciled, patched.

Each state is entered by one event:
- calm: resting. db.users is a quiet one-line row in the feed. Epoch live marker on v7.
- detected: event delta.detected (db.users v7 to v8). The card is born.
- fenced: event write.fenced (ben, routes/users.ts). The block lands.
- advised: event advisory.delivered (per recipient). Tailored guidance lands.
- reconciling: transient. Consumers are self-correcting. Tracks a count 0/2, 1/2.
- reconciled: event reconciled when count hits 2/2.
- patched: event spec.pr.opened (#14). The artifact exists.

The card also tracks per-node sub-state for the blast radius (below), independent of the card stage, because ben and chen progress on their own timelines.

## Stage-by-stage choreography

Calm to detected (trigger: delta.detected)
- Epoch strip ticks. A new node appears at the end, v8, amber. The amber "live" marker advances from v7 to v8 along the strip. This is the sanctioned version-tick motion. epoch.tick, 480ms, cubic-bezier(0.65,0,0.35,1).
- The collapsed db.users feed row expands into the full drift card and takes the left column. card.expand, 420ms, cubic-bezier(0.16,1,0.3,1).
- One amber ripple emanates from the card's left edge, expands once, fades. Single ripple, never looped. ripple, 640ms ease-out, opacity 0.5 to 0.
- Header severity tint set to amber (contract-surface activity, not yet breakage).
- Chip row renders. The detected 0.3s chip is saturated amber (active stage). The remaining chips (fenced, advised, reconciled, spec PR) render as ghosts: gray outline, no fill, showing the path ahead.
- The why fades in: asha: "phone signups make email the wrong name." The mechanical change users.email to contact_email appears in monospace; the strikethrough on users.email draws left to right over 200ms.
- Blast radius: central node db.users v8 appears amber and pulses once. Consumer nodes ben and chen appear as neutral gray outlines. Connecting lines draw from center outward, line.draw 320ms each, staggered 80ms.

Detected to fenced (trigger: write.fenced, ~5.8s real)
- The dramatic beat. Header tint shifts amber to red. This is the only point red appears; keep it scarce.
- detected chip de-saturates to complete (gray with a small amber dot). chip.complete, 260ms. The fenced 5.8s chip activates, saturated red. chip.activate, 200ms.
- In the blast radius, the ben node (routes/users.ts) flips to red with a lock icon and label fenced. Use a punch, not a fade: scale 1 to 1.15 to 1, node.fence 200ms cubic-bezier(0.34,1.56,0.64,1). The center-to-ben line pulses red once.

Fenced to advised (trigger: advisory.delivered, ~6.4s real)
- Header tint de-escalates from red to neutral dark. The breakage is being handled; red does not linger.
- fenced chip de-saturates to complete (gray with a small red dot). The advised 6.4s chip activates, saturated blue.
- Blast radius: chen node (UserCard.tsx) flips to blue with label advised. node.appear-style color change, 240ms. ben stays red (still resolving); ben was both fenced and advised but reads as fenced until it reconciles.

Advised to reconciling (transient)
- The reconciled chip shows a live count: reconciling 0/2, then 1/2 as each consumer's clean write lands. Each increment is a real event.
- When ben's corrected write lands: ben node red to green, label fenced to reconciled, checkmark fades in. node.resolve 360ms ease-out, check 160ms. Count to 1/2.
- When chen's types regenerate: chen node blue to green, label advised to reconciled. Count to 2/2.

Reconciling to reconciled (trigger: count 2/2)
- The reconciled 2/2 chip activates, saturated green; all prior chips muted-complete.
- Header tint eases to green.
- Blast radius: one soft green pulse across the whole graphic, signifying sync. settle.pulse 520ms ease-out, single.

Reconciled to patched (trigger: spec.pr.opened, ~14:04)
- The spec PR open 14:04 chip appears last, with the git-pull-request icon (keep whatever hue your mockup used for it; info-blue is fine as a generated-artifact marker).
- The resolution footer slides up: spec PR #14 link and ledger entry link. footer.slide 300ms ease-out.
- After a 2 to 3 second beat, the card may auto-collapse back to a calm one-line feed entry, now green-checked and marked resolved, returning the Tower to calm. The epoch strip settles with v8 as the live version and the footer reads all sessions synced to v8. This closes the full arc: calm to drift to calm.

## Blast radius node sub-states (the signature element)

Invest here; this is the product's signature graphic and the emotional arc of the demo.
- ben (routes/users.ts): neutral outline, then red (fenced) with lock, then green (reconciled) with check.
- chen (UserCard.tsx): neutral outline, then blue (advised), then green (reconciled) with check.
- center db.users v8: amber throughout, single pulse on birth and on final settle.
- Remove the concentric dashed rings from the current mockup; they read as radar. Pull both consumer nodes closer to center so the two connecting lines are the dominant shape, and size the node labels and filenames for legibility across a room.

## Animation tokens

| token | duration | easing | notes |
|---|---|---|---|
| card.expand | 420ms | cubic-bezier(0.16,1,0.3,1) | collapse to full card |
| epoch.tick | 480ms | cubic-bezier(0.65,0,0.35,1) | live marker advances v7 to v8 |
| ripple | 640ms | ease-out | single, opacity 0.5 to 0, never looped |
| chip.activate | 200ms | ease-out | ghost or muted to saturated |
| chip.complete | 260ms | ease | active to muted with colored dot |
| line.draw | 320ms | ease-out | stagger 80ms per line |
| node.appear | 240ms | ease-out | neutral or color change |
| node.fence | 200ms | cubic-bezier(0.34,1.56,0.64,1) | scale 1 to 1.15 to 1, the punch |
| node.resolve | 360ms | ease-out | to green, then check fade 160ms |
| settle.pulse | 520ms | ease-out | single green pulse on the graphic |
| footer.slide | 300ms | ease-out | resolution footer up |

Rule of thumb: things entering use an emphasized decelerate so they arrive and settle; the fence punch is the one snappy overshoot; nothing loops.

## Two run modes

Live mode (real agents). Pure event-driven. The early cluster (detected, fenced, advised) lands within about six real seconds, which is naturally good on a projector. The reconcile gap of roughly eighty seconds is quiet, so narrate over it; when ben and chen reconcile, the card resolves on its own, which is a strong "it fixed itself while I was talking" moment. Do not fake it.

Replay/video mode (a short recorded walkthrough). A scripted emitter fires the same stage transitions on a compressed timeline. Critical honesty rule: the elapsed-time text inside the chips stays the real numbers (0.3s, 5.8s, 6.4s, reconciled by 14:03:40, PR 14:04). Only the wall-clock pacing of the animation is compressed. You are showing a time-lapse and the labels say so.

Suggested compressed timeline (about 8 seconds):
- 0.0s detected
- 1.2s fenced, ben node punch to red
- 2.0s advised, chen node to blue
- 3.5s reconciling 1/2, ben to green
- 4.8s reconciled 2/2, chen to green, settle pulse
- 6.2s spec PR open, footer slides up
- 7.5s card relaxes, optional auto-collapse

## Reduced motion and fallback

Respect prefers-reduced-motion, and treat it as your jank insurance on an unfamiliar demo machine. In reduced mode: skip the ripple, the fence punch, the line-draw, and the settle pulse; use instant or simple opacity crossfades for every state change. All information (header tint, chip colors and labels, node colors, the count) must convey the full story without any motion. If the GPU on the venue machine struggles, flip this on and the demo still reads.

## TV mode adjustments

For the shared-screen variant, exaggerate so the motion is catchable from ten feet: larger ripple radius, larger fence punch (scale to 1.2), and roughly 1.3x the durations above so each beat is legible rather than instant. Fewer simultaneous transitions; let one thing move at a time.

## Build priority if short on time

Ranked. The first three carry the demo; the rest is polish.
1. Epoch tick v7 to v8 (truth changed).
2. Blast radius node flips: ben neutral to red to green, chen neutral to blue to green.
3. Lifecycle chip progression: active stage saturated, completed stages muted with a colored dot.
4. Card birth (collapse to expand).
5. Polish: ripple, header tint progression, settle pulse, footer slide, auto-collapse.
