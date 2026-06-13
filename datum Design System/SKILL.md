---
name: datum-design
description: Use this skill to generate well-branded interfaces and assets for datum (the real-time coordination layer for teams running AI coding agents), either for production or throwaway prototypes/mocks/etc. Contains essential design guidelines, colors, type, fonts, assets, and UI kit components for prototyping.
user-invocable: true
---

Read the `readme.md` file within this skill, and explore the other available files.

datum is dark-first developer infrastructure — terminal-adjacent, calm by default, color only on real events. The non-negotiables:
- **Geist Mono for every identifier** (contract name, path, version, timestamp); Geist for prose.
- **Color is strictly semantic and scarce**: amber = contract activity + live epoch, red = breaking delta + fence, blue = advisory, green = reconciled/synced. Everything ambient is gray.
- **1px hairlines, 6–8px radii, no drop shadows, no gradients, no emoji.** Motion only on real events.
- Voice: terse, technical, lowercase product nouns.

Key files:
- `readme.md` — full content + visual + iconography guidelines and the file index.
- `styles.css` + `tokens/` — link `styles.css` to inherit every token and font.
- `components/` — Button, Badge, Tag, Card, Input, EpochStrip, LifecycleChip, PresenceAvatar, ContractRow, LedgerEntry, BlastRadius, DriftCard (read each `.prompt.md`).
- `ui_kits/tower/` — a full interactive recreation of the web tower to crib layout from.
- `assets/logo/` — the benchmark mark (vector).

If creating visual artifacts (slides, mocks, throwaway prototypes), copy assets out and create static HTML files for the user to view. If working on production code, copy assets and read the rules here to become an expert in designing with this brand.

If the user invokes this skill without any other guidance, ask them what they want to build or design, ask some questions, and act as an expert designer who outputs HTML artifacts _or_ production code, depending on the need.
