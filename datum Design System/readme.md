# datum — design system

**datum** is the real-time coordination layer for teams of developers who each run AI coding agents (Claude Code today). It maintains a live, versioned source of truth for a team's **contracts** (DB schemas, API shapes, dependency versions, free-form decisions), captures every agent's activity through hooks, **fences** stale writes deterministically, and uses a frontier-model arbiter to tell each affected teammate what a change means for their specific in-flight work.

> git coordinates code at rest; **datum coordinates agents in motion.**

The name comes from surveying — a *datum* is the fixed reference surface that all measurements derive from. The brand mark is a **benchmark glyph**: a survey crosshair with a single amber datum point at its center.

## Surfaces
1. **The terminal is the cockpit.** Engineers live in Claude Code; datum speaks there via injected advisories and fence denials.
2. **The web app is the tower.** It shows what no single cockpit can see: shared truth, who is building against what, drift as it happens, decision history. *This is the primary surface this design system dresses.*
3. **TV mode.** A higher-contrast, larger-type variant of the tower for a shared screen, legible from ten feet.
4. **Mobile glance** (later). One screen: fleet status, last delta, anything awaiting human arbitration.

## Sources
This system was built from a written product brief and a set of logo studies — no codebase or Figma was attached. If you have them, store links here so future work can reference the source of truth:
- Product/design brief: `uploads/datum-design-context.md` (kept in the project).
- Logo studies: `uploads/Gemini_Generated_Image_*.png` (six AI logo studies). The mark was **redrawn as clean vector** in `assets/logo/` — the PNGs carry generator paper-texture noise and are not production assets.
- Codebase / Figma: **none provided.** Components here are an original interpretation faithful to the brief, not a recreation of existing UI code.

---

## CONTENT FUNDAMENTALS — how datum writes

**Voice: terse, technical, lowercase product nouns.** datum reads like a tool, not a teammate cheering you on. Every assertion is load-bearing.

- **Casing.** Product nouns and UI labels are **lowercase**: `tower`, `registry`, `replay`, `current truth`, `drift`, `advisory`, `ledger`. Sentence case for prose. Identifiers keep their literal casing (`UserCard.tsx`, `GET /users/:id`). Never Title Case marketing ("Database Schema Successfully Updated!").
- **Person.** Mostly impersonal/system voice ("write fenced", "3 agents live"). Advisories address the recipient directly and imperatively ("update both before your next write"). Avoid "we"/"you have N collaborators" CRM phrasing.
- **No exclamation, no emoji, no encouragement.** State changes are reported, not celebrated. `ben's write fenced · stale by 1 epoch`, not `Oops! Your changes were blocked 🚫`.
- **Every fact carries who / when / why.** No bare assertions anywhere — a delta names its session and reason; a ledger line names its author and time.
- **Cartographic microcopy, sparingly.** Surveying language is allowed in copy only, never in chrome: *re-baselining*, *off datum by 2 versions*, *synced to v8*. Keep it subtle; never themed or skeuomorphic (no radar sweeps, no map textures).
- **Numbers are quiet.** The four fleet metrics (deltas today, writes fenced, delta→fence, rework avoided) are a strip, not a hero. No vanity stats.

**Controlled vocabulary** (use these exact words):
`datum` / `current truth` (the live registry) · `epoch` (a contract version, e.g. v8) · `delta` (a change to a contract) · `fence` (a blocked stale write) · `advisory` (per-recipient explanation of a delta) · `blast radius` (sessions/files a delta affects) · `ledger` (append-only decision history) · `claim` (a session's declared scope) · `session` (a human + their agent, as one unit).

---

## VISUAL FOUNDATIONS

**Overall vibe.** Dark-first developer infrastructure. Linear's crispness, Vercel's monochrome restraint, incident.io's lifecycle clarity, a little Warp terminal-warmth. Dev-tool sensibility, *not* analytics-dashboard sensibility. Calm by default; loud only on drift.

**Color.** Ambient activity is gray — always. Color is **strictly semantic and scarce**, and each hue means exactly one thing:
- **amber `#F5A623`** — contract-surface activity + the live epoch (and the datum point in the mark). Nothing else.
- **red `#E5484D`** — breaking deltas and fences. Scarcity is what makes red legible; never use it decoratively.
- **blue `#4D8DF6`** — advisories.
- **green `#2FA46C`** — reconciled / synced.
- Neutrals: bg `#0B0B0C`, surface `#151517`, hairline `#26262A`, text `#F2F1EC / #A0A0A6 / #66666C`. Light variant: bg `#FAFAF8`, text `#1A1A1C`.
Signal hues appear as low-alpha **tints + hairlines** for chips, or as a solid fill / a thin top rule on a card. See `tokens/colors.css`.

**Type.** Two families in product. **Geist** for all UI prose. **Geist Mono** for *every identifier* — contract names, file paths, versions, timestamps, branches, deltas, migration numbers. Identifiers are **never** proportional type; this is the single most recognizable rule of the system. Compact, dev-tool sizing (14px body; identifiers 12–13px). Display sizes are reserved for marketing / TV mode. A third face, **Geist Pixel (Square)** via `--font-pixel`, is sanctioned for **marketing surfaces only** — hero headlines, TV-mode titles, swag — never product UI chrome and never identifiers. See `tokens/typography.css`.

**Backgrounds.** Flat fields only. **No gradients** (the lone exception is a 1px epoch connector fading gray→amber and a faint focus/pulse ring). No images, no textures, no patterns, no glassmorphism/blur. The dark field is the canvas; surfaces are distinguished by 1px hairlines, not elevation.

**Borders, radii, shadows.** 1px hairline borders everywhere; **6–8px** corner radii (3px chips, 5px inputs, 7px cards/buttons, 9px large). **No drop shadows at all** — the only "elevation" is a hairline plus an occasional inset ring. Cards are a flat surface (`#151517`) + hairline + radius; severity shows as a **thin top rule** in the signal hue, never a colored left-border accent.

**Motion.** Purposeful and event-driven only — *motion means something happened*. Crisp easing (`cubic-bezier(.22,1,.36,1)`), short durations (130–340ms). No decorative loops, no parallax, no entrance choreography on ambient content. All motion is gated behind `prefers-reduced-motion`. The full vocabulary lives in two places: the **drift card lifecycle** (a contract delta animates through `detected → fenced → advised → reconciling → reconciled → patched`) and the **epoch tick** (the live marker advancing a version). Sanctioned beats, each tied to a real event: `card.expand` (420ms, decel — collapsed feed row → full card), `epoch.tick` (480ms — live marker advances v7→v8), a single left-edge `ripple` (640ms, never looped), `chip.activate`/`chip.complete` (the active stage saturates, completed stages recede to gray + a colored dot), `line.draw` (blast-radius connectors, 80ms stagger), the `node.fence` **punch** (200ms overshoot — the one snappy beat), `node.resolve` (→ green + check), and a single green `settle.pulse` on sync. The fence punch is the only overshoot; nothing loops. In reduced-motion every beat degrades to an opacity crossfade and all information (header tint, chip colors/labels, node colors, the count) still reads. See `LiveDriftCard` and the **Live drift card (animated)** card.

**States.** Hover = a step up in surface (`#151517 → #1C1C1F`) and/or text gray → primary; never a glow. Press = a slightly darker surface (no shrink/scale on chrome). Focus = a 2px neutral ring (`--ring-focus`), not a colored halo. Disabled = 45% opacity.

**Layout.** Fixed left nav rail (56px), a top bar (52px) with workspace + drift status + presence, and the **epoch strip** — the version spine — pinned beneath it on every tower surface. Two-column body (main feed + registry/ledger rail). A quiet fleet-status footer. Presence is **Figma-style**: small initials avatars parked on the contracts/files a session is building against (human + agent as one unit — never a robot avatar).

**Imagery.** There is essentially none — this is a data product. No photography, no illustration, no mascots. The only "graphic" is the **blast-radius** diagram (the product's signature): a delta at center, affected sessions/files as nodes on a faint survey radius, each carrying its lifecycle status color.

---

## ICONOGRAPHY

- **Style.** Line icons, ~1.3–1.4px stroke on a 16–20px grid, rounded caps/joins, no fill. They read as quiet UI furniture, drawn in `--text-tertiary`/`--text-secondary` and only ever picking up a signal hue when they carry state.
- **Source.** No icon dependency is bundled. Icons in the components and kit are **small inline SVGs** drawn to match (contract/file, fence/grid, info, check, patch, pull-request, terminal, gear, clock-rewind). They live inside the components that use them. If you want a full library, **Lucide** (lucide.dev) is the closest match to this stroke weight/feel — substitute it 1:1 and keep strokes ≤1.5px. *(Flagged substitution: Lucide is a recommendation, not what's shipped here.)*
- **The mark.** The benchmark glyph is the one bespoke piece of iconography — a survey crosshair (circle + four ticks that overshoot it) with an amber center dot. Vectors in `assets/logo/`. Strokes are `currentColor` so it inverts cleanly between themes; only the center dot is amber.
- **Emoji / unicode.** **No emoji**, ever. The surveying glyph `⌖` may appear as a typographic flourish in prose, but the drawn mark is preferred in UI. `→` (delta transitions), `·` (mono separators) and `✓` (reconciled) are the only unicode used as glyphs.

---

## INDEX — what's in this system

**Foundations**
- `styles.css` — global entry point (import manifest only). Consumers link this one file.
- `tokens/colors.css` · `typography.css` · `spacing.css` · `fonts.css` · `base.css` — design tokens + the two webfonts (self-hosted Geist / Geist Mono, latin subset).
- `guidelines/cards/` — 17 foundation specimen cards (Type, Colors, Spacing, Brand) shown in the Design System tab.

**Assets**
- `assets/logo/` — `mark.svg`, `mark-mono.svg`, `lockup-horizontal.svg`, `favicon.svg`.
- `assets/fonts/` — Geist + Geist Mono woff2.

**Components** (`window.DatumDesignSystem_b409bf`)
- `components/core/` — **Button, Badge, Tag, Card, Input.**
- `components/tower/` — **EpochStrip, LifecycleChip, PresenceAvatar / PresenceStack, ContractRow, LedgerEntry.**
- `components/drift/` — **BlastRadius**, **DriftCard** (the static hero, collapsed + expanded), and **LiveDriftCard** (the event-driven state machine: one render path, a scripted `fire()` for replay/video and `emit(event)` for a live bus; honors reduced-motion).

**UI kit**
- `ui_kits/tower/` — interactive recreation of the web tower: home (calm + drift), registry (history + diff), replay, install. See its `README.md`.

**Templates**
- `templates/tower-screen/` — a copy-to-start tower screen (Design Component).

**Skill**
- `SKILL.md` — makes this folder usable as a downloadable Agent Skill.

> **Fonts.** Geist & Geist Mono are the **official Vercel v1.7.2 webfonts** (full builds, OFL — license at `assets/fonts/OFL.txt`). Weights shipped: Geist 400/500/600/700, Geist Mono 400/500/600, plus **Geist Pixel Square** (marketing display only). Source archives live in `uploads/` if more weights/italics/pixel variants are ever needed.
