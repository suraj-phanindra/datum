The hero component — a contract delta rendered as a mini-incident with a lifecycle. Collapsed it is one calm line in the ledger feed; expanded (live drift) it owns the screen.

```jsx
<DriftCard
  contract="db.users" fromVersion="v7" toVersion="v8" timestamp="14:02:11"
  severity="red"
  lifecycle={[
    { stage: "detected", elapsed: "0.3s" },
    { stage: "fenced", elapsed: "5.8s" },
    { stage: "advised", elapsed: "6.4s" },
    { stage: "reconciled", elapsed: "2/2" },
  ]}
  quote={{ who: "asha", text: "phone signups make email the wrong name." }}
  change={{ from: "users.email", to: "contact_email", migration: "migration 0042" }}
  nodes={[
    { initials: "be", label: "routes/users.ts", status: "reconciled" },
    { initials: "ch", label: "UserCard.tsx", status: "reconciled" },
  ]}
  pr={{ label: "spec PR #14" }}
  ledger={{ label: "ledger #112" }}
/>
```

Pass `defaultOpen={false}` for the calm collapsed line. The blast-radius graphic comes from the `nodes` prop (BlastRadius is its own component too).
