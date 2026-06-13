// Tower home — calm state and drift state.
const TH = window.DatumDesignSystem_b409bf;

function sessionsFor(initials) {
  return initials.map((i) => window.DATUM.sessions.find((s) => s.initials === i)).filter(Boolean);
}

function AdvisoryCard({ adv }) {
  return (
    <div className="tw-adv">
      <div className="tw-adv__head">
        <TH.Badge signal="blue" dot>advisory</TH.Badge>
        <span className="tw-adv__to mono">to {adv.to}</span>
        <span className="tw-adv__file mono">{adv.file}</span>
      </div>
      <p className="tw-adv__body">{adv.text}</p>
    </div>
  );
}

function CalmFeed() {
  const d = window.DATUM;
  // resting: every delta is a flat, equal-weight one-liner. no amber here —
  // the only amber on this screen is the live v8 marker in the epoch strip.
  const rows = [
    { name: d.drift.contract, from: d.drift.from, to: d.drift.to, time: d.drift.timestamp.slice(0, 5) },
    { name: "api.GET /users/:id", from: "v2", to: "v3", time: "13:02" },
    { name: "deps.db-driver", from: "v1", to: "v2", time: "10:30" },
  ];
  return (
    <div className="tw-calm">
      <div className="tw-calm__note mono">
        <span className="tw-calm__pip" /> nothing pulses · {d.fleet.agents} agents building against current truth
      </div>
      {rows.map((r) => (
        <div className="tw-calm__delta-line mono" key={r.name}>
          <span className="tw-calm__sev" /> {r.name} <span className="dim">{r.from} → {r.to}</span>
          <span className="tw-calm__t">{r.time}</span>
        </div>
      ))}
    </div>
  );
}

function DriftState({ onStageChange }) {
  const d = window.DATUM;
  const ref = React.useRef(null);
  const [stage, setStage] = React.useState("calm");
  const order = { calm:0, detected:1, fenced:2, advised:3, reconciling:4, reconciled:5, patched:6 };
  const handle = (s) => { setStage(s); if (onStageChange) onStageChange(s); };
  const showAdv = (order[stage] || 0) >= order.advised;
  return (
    <div className="tw-drift">
      <div className="tw-drift__phase">
        <span className="eyebrow">live arc</span>
        <div className="tw-arc-ctrl">
          <button className="tw-arc-btn" onClick={() => ref.current && ref.current.fire()}>▶ fire delta</button>
          <button className="tw-arc-btn tw-arc-btn--ghost" onClick={() => ref.current && ref.current.reset()}>reset</button>
        </div>
      </div>
      <TH.LiveDriftCard ref={ref} autoPlay onStageChange={handle}
        nodes={[{ initials:"be", who:"ben", label:"routes/users.ts" }, { initials:"ch", who:"chen", label:"UserCard.tsx" }]}
        pr={{ label:"spec PR #14" }} ledger={{ label:"ledger #112" }} />
      {showAdv && (
        <div className="tw-adv-wrap">
          <span className="eyebrow">advisories · per recipient</span>
          {d.drift.advisories.map((a) => <AdvisoryCard key={a.to} adv={a} />)}
        </div>
      )}
    </div>
  );
}

function Rail() {
  const d = window.DATUM;
  return (
    <aside className="tw-rail-col">
      <TH.Card eyebrow="current truth" title="registry" flush
        actions={<button className="tw-link mono">browse →</button>}>
        <div>
          {d.contracts.map((c) => (
            <TH.ContractRow key={c.name} name={c.name} version={c.version}
              live={c.live} drift={c.drift} sessions={sessionsFor(c.sessions)} />
          ))}
        </div>
      </TH.Card>

      <TH.Card eyebrow="decision history" title="ledger" flush>
        <div>
          {d.ledger.slice(0, 5).map((l, i) => (
            <TH.LedgerEntry key={l.id} id={l.id} time={l.time} who={l.who} head={i === 0}
              summary={l.contract
                ? <span>{l.summary} <span className="amber">{l.contract}</span> · {l.tail}</span>
                : l.summary} />
          ))}
        </div>
      </TH.Card>
    </aside>
  );
}

function TowerHome({ driftOn, onToggle, onDriftStage }) {
  return (
    <div className="tw-home">
      <div className="tw-home__main">
        <div className="tw-home__head">
          <h1 className="tw-home__title">tower</h1>
          <div className="tw-seg" role="tablist">
            <button className="tw-seg__b" data-on={!driftOn} onClick={() => onToggle(false)}>calm</button>
            <button className="tw-seg__b" data-on={driftOn} onClick={() => onToggle(true)}>drift</button>
          </div>
        </div>
        {driftOn ? <DriftState onStageChange={onDriftStage} /> : <CalmFeed />}
      </div>
      <Rail />
    </div>
  );
}
window.TowerHome = TowerHome;
