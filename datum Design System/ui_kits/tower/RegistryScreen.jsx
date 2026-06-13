// Registry — current truth, browsable. Version history (who/when/why),
// presence, and a diff between two versions.
const RG = window.DatumDesignSystem_b409bf;

const DIFF = {
  "db.users": {
    a: "v7", b: "v8",
    hunks: [
      { t: "ctx", s: "table users (" },
      { t: "ctx", s: "  id            uuid    pk" },
      { t: "del", s: "  email         text    not null" },
      { t: "add", s: "  contact_email text    not null" },
      { t: "ctx", s: "  team_id       uuid    fk teams.id" },
      { t: "ctx", s: "  last_seen_at  timestamptz" },
      { t: "ctx", s: ")" },
      { t: "note", s: "migration 0042 · asha · 14:02:11" },
    ],
  },
};

function VersionHistory({ contract }) {
  return (
    <ol className="rg-hist">
      {contract.history.map((h, i) => (
        <li className="rg-hist__row" key={h.v} data-head={i === 0}>
          <div className="rg-hist__spine"><span className="rg-hist__dot" data-live={i === 0 && contract.live} /></div>
          <div className="rg-hist__body">
            <div className="rg-hist__meta mono">
              <span className="rg-hist__v" data-live={i === 0 && contract.live}>{h.v}</span>
              <span className="rg-hist__who">{h.who}</span>
              <span className="rg-hist__time">{h.time}</span>
            </div>
            <div className="rg-hist__why">{h.why}</div>
          </div>
        </li>
      ))}
    </ol>
  );
}

function DiffView({ name }) {
  const diff = DIFF[name];
  if (!diff) {
    return <div className="rg-diff rg-diff--empty mono">no breaking diff · {name} is reconciled</div>;
  }
  return (
    <div className="rg-diff">
      <div className="rg-diff__bar mono">
        <span>diff</span><span className="rg-diff__ab">{diff.a} → <span className="amber">{diff.b}</span></span>
      </div>
      <pre className="rg-diff__code">{diff.hunks.map((h, i) => (
        <div className={"rg-diff__ln rg-diff__ln--" + h.t} key={i}>
          <span className="rg-diff__gut">{h.t === "add" ? "+" : h.t === "del" ? "-" : h.t === "note" ? "✓" : " "}</span>
          <span>{h.s}</span>
        </div>
      ))}</pre>
    </div>
  );
}

function sessFor(initials) {
  return initials.map((i) => window.DATUM.sessions.find((s) => s.initials === i)).filter(Boolean);
}

function RegistryScreen() {
  const d = window.DATUM;
  const [sel, setSel] = React.useState(d.contracts[0].name);
  const contract = d.contracts.find((c) => c.name === sel);
  return (
    <div className="rg">
      <div className="rg__list">
        <span className="eyebrow" style={{ padding: "0 12px 8px", display: "block" }}>current truth · {d.contracts.length} contracts</span>
        <div className="rg__rows">
          {d.contracts.map((c) => (
            <div key={c.name} className="rg__rowwrap" data-sel={c.name === sel} onClick={() => setSel(c.name)}>
              <RG.ContractRow name={c.name} version={c.version} live={c.live} drift={c.drift}
                sessions={sessFor(c.sessions)} interactive={false} />
            </div>
          ))}
        </div>
      </div>

      <div className="rg__detail">
        <div className="rg__detail-head">
          <div className="rg__title mono">{contract.name}
            <span className="rg__title-v" data-live={contract.live}>{contract.version}</span>
          </div>
          <div className="rg__presence">
            <span className="eyebrow">building against</span>
            <RG.PresenceStack sessions={sessFor(contract.sessions)} max={3} />
          </div>
        </div>

        <div className="rg__cols">
          <div className="rg__col">
            <span className="eyebrow">version history · who / when / why</span>
            <VersionHistory contract={contract} />
          </div>
          <div className="rg__col">
            <span className="eyebrow">diff</span>
            <DiffView name={contract.name} />
          </div>
        </div>
      </div>
    </div>
  );
}
window.RegistryScreen = RegistryScreen;
