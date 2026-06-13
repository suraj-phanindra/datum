The drift card as an explicit, event-driven state machine — the live-demo / video centerpiece. One render path, two event sources: a scripted emitter (`fire()`, compressed ~8s arc) for replay/video, and `emit(event)` for a real bus. Motion only ever responds to an event; nothing loops. Honors `prefers-reduced-motion`.

```jsx
const ref = React.useRef(null);
<LiveDriftCard ref={ref} autoPlay
  contract="db.users" fromVersion="v7" toVersion="v8" timestamp="14:02:11"
  quote={{ who: "asha", text: "phone signups make email the wrong name." }}
  change={{ from: "users.email", to: "contact_email", migration: "migration 0042" }}
  nodes={[
    { initials: "be", who: "ben", label: "routes/users.ts" },
    { initials: "ch", who: "chen", label: "UserCard.tsx" },
  ]}
  pr={{ label: "spec PR #14" }} ledger={{ label: "ledger #112" }}
/>;

// replay / video:
ref.current.fire();
// live bus:
ref.current.emit("write.fenced");
```

Stages: `calm → detected → fenced → advised → reconciling → reconciled → patched`. The elapsed labels in the chips stay the **real** numbers (0.3s / 5.8s / 6.4s / 2/2 / 14:04) even in compressed replay — only wall-clock pacing changes. Pair with `EpochStrip` (`animateLive`) to land the v7→v8 tick alongside the card.
