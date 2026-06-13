// Fleet status — a quiet metrics strip, never the point.
function FleetFooter() {
  const f = window.DATUM.fleet;
  const Metric = ({ label, value, accent }) => (
    <div className="tw-fleet__m">
      <span className="tw-fleet__v mono" data-accent={accent || false}>{value}</span>
      <span className="tw-fleet__l">{label}</span>
    </div>
  );
  return (
    <footer className="tw-fleet">
      <div className="tw-fleet__lead mono">
        <span className="tw-fleet__dot" />
        all sessions synced to <span className="amber">v8</span> · {f.agents} agents live · last delta {f.lastDelta}
      </div>
      <div className="tw-fleet__metrics">
        <Metric label="deltas today" value={f.deltas} />
        <Metric label="writes fenced" value={f.fenced} />
        <Metric label="delta→fence" value={f.deltaToFence} />
        <Metric label="rework avoided" value={f.reworkAvoided} accent />
      </div>
    </footer>
  );
}
window.FleetFooter = FleetFooter;
