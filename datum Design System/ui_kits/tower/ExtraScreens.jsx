// Install (onboarding) + Replay (forensics) screens.
const EX = window.DatumDesignSystem_b409bf;

function InstallScreen() {
  const [copied, setCopied] = React.useState(false);
  const hooks = [
    { e: "PreToolUse", f: ".claude/hooks/datum-fence.ts", d: "fence stale writes before they land" },
    { e: "PostToolUse", f: ".claude/hooks/datum-claim.ts", d: "publish your claim + activity" },
    { e: "SessionStart", f: ".claude/hooks/datum-join.ts", d: "register session on the workspace" },
  ];
  return (
    <div className="ix">
      <div className="ix__col">
        <span className="eyebrow">install · one command</span>
        <h1 className="ix__h1">point your agent at the datum</h1>
        <p className="ix__lede">datum writes three Claude Code hooks and connects this repo to the live contract registry. nothing else changes in your loop.</p>

        <div className="ix__cmd mono" onClick={() => { setCopied(true); setTimeout(() => setCopied(false), 1400); }}>
          <span className="ix__prompt">$</span>
          <span className="ix__cmd-txt">npx datum init <span className="dim">--workspace acme/workspaces</span></span>
          <span className="ix__copy">{copied ? "copied" : "copy"}</span>
        </div>

        <span className="eyebrow" style={{ marginTop: 22, display: "block" }}>hooks written</span>
        <ul className="ix__hooks">
          {hooks.map((h) => (
            <li className="ix__hook" key={h.e}>
              <EX.Badge signal="neutral" size="sm">{h.e}</EX.Badge>
              <span className="ix__hook-f mono">{h.f}</span>
              <span className="ix__hook-d">{h.d}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="ix__side">
        <div className="ix__live">
          <div className="ix__live-head">
            <span className="ix__live-dot" />
            <span className="eyebrow" style={{ color: "var(--signal-green)" }}>first event received</span>
          </div>
          <div className="ix__live-rows mono">
            <div><span className="dim">14:08:02</span> session <b>asha</b> joined · branch <span className="amber">asha/schema</span></div>
            <div><span className="dim">14:08:02</span> claim published · <span className="dim">data layer</span></div>
            <div><span className="dim">14:08:03</span> synced to <span className="amber">v8</span> · 4 contracts</div>
            <div className="ix__live-ok"><span className="ix__ok">✓</span> on datum · you are coordinated</div>
          </div>
        </div>
      </div>
    </div>
  );
}

const LANES = [
  { who: "asha", branch: "asha/schema", events: [{ at: 4, kind: "delta", label: "v8 · rename", t: "14:02:11" }] },
  { who: "ben", branch: "ben/api", events: [{ at: 20, kind: "fenced", label: "write fenced", t: "+5.8s" }, { at: 46, kind: "advised", label: "advised", t: "+6.4s" }, { at: 76, kind: "reconciled", label: "reconciled", t: "+71s" }] },
  { who: "chen", branch: "chen/ui", events: [{ at: 46, kind: "advised", label: "advised", t: "+6.4s" }, { at: 92, kind: "reconciled", label: "reconciled", t: "+89s" }] },
];
const KIND_VAR = { delta: "--amber", fenced: "--red", advised: "--blue", reconciled: "--green" };

function ReplayScreen() {
  const [play, setPlay] = React.useState(96);
  return (
    <div className="rp">
      <div className="rp__head">
        <div>
          <span className="eyebrow">replay · forensics</span>
          <h1 className="rp__h1 mono">db.users v7 → v8 <span className="dim">· 14:02:11 → 14:03:40 · 89s window</span></h1>
        </div>
        <div className="rp__scrub">
          <span className="mono rp__scrub-t">+{(play / 100 * 89).toFixed(1)}s</span>
          <input type="range" min="0" max="100" value={play} onChange={(e) => setPlay(+e.target.value)} />
        </div>
      </div>

      <div className="rp__lanes">
        <div className="rp__axis" style={{ left: play + "%" }} />
        {LANES.map((lane) => (
          <div className="rp__lane" key={lane.who}>
            <div className="rp__lane-label">
              <span className="rp__lane-who mono">{lane.who}</span>
              <span className="rp__lane-branch mono">{lane.branch}</span>
            </div>
            <div className="rp__track">
              {lane.events.map((ev, i) => (
                <div key={i} className="rp__ev" data-on={ev.at <= play}
                  style={{ left: ev.at + "%", "--c": `var(${KIND_VAR[ev.kind]})` }}>
                  <span className="rp__ev-dot" />
                  <span className="rp__ev-label mono">{ev.label}<span className="rp__ev-t">{ev.t}</span></span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="rp__foot mono">detected 0.3s · fenced 5.8s · advised 6.4s · both reconciled by 14:03:40 · spec PR #14 at 14:04</div>
    </div>
  );
}

window.InstallScreen = InstallScreen;
window.ReplayScreen = ReplayScreen;
