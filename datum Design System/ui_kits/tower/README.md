# Tower — datum web app UI kit

The **tower** is datum's web surface: it shows what no single terminal cockpit can see — the shared contract registry, drift as it happens, and the decision ledger. This kit is an interactive recreation of the four tower views.

## Run it
Open `index.html`. It mounts a clickable app with a left nav rail. The bundle (`_ds_bundle.js`) and `styles.css` are loaded from the design-system root, so all primitives (DriftCard, EpochStrip, ContractRow, …) come from the real components.

## Screens
| File | Screen | Notes |
|---|---|---|
| `TowerHome.jsx` | **Tower home** | Toggle **calm ↔ drift** (segmented control, top right). Calm = quiet feed, nothing pulses. Drift = the DriftCard owns the screen + per-recipient advisories. |
| `RegistryScreen.jsx` | **Registry** | Browsable current truth. Select a contract → version history (who/when/why) + a v7→v8 diff. |
| `ExtraScreens.jsx` | **Replay** | Forensics. The one place a lane/waterfall layout is allowed; scrub the lifecycle. |
| `ExtraScreens.jsx` | **Install** | Onboarding: the single install command, the hooks written, a live "first event received" confirmation. |
| `Chrome.jsx` | **Shell** | Left nav rail, top bar, epoch spine. |
| `FleetFooter.jsx` | **Fleet strip** | The four fleet metrics as a quiet strip — never the point. |
| `data.js` | sample data | All values verbatim from the product brief. |

## Composition
Layout/chrome is local to the kit; everything semantic (cards, badges, identifiers, presence, the drift card and its blast-radius graphic) is composed from the published components. Each JSX file exports to `window` and reads primitives from `window.DatumDesignSystem_b409bf`.

## Theme
The sun icon (bottom of the nav rail) toggles `data-theme` between dark and light — both variants are supported.
