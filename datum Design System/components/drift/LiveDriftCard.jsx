import React from "react";

/* ============================================================
   datum · LiveDriftCard
   The drift card as an explicit state machine. One render path,
   two event sources: a scripted emitter (replay/video) and the
   imperative emit() (live bus). Motion only ever responds to an
   event — nothing here is on a decorative clock.
   States: calm → detected → fenced → advised → reconciling
           → reconciled → patched
   ============================================================ */

const CSS = `
.dtm-live{ position:relative; }
.dtm-live__feed{ display:flex; align-items:center; justify-content:space-between;
  padding:11px 14px; border:1px solid var(--border-hairline); border-radius:var(--radius-md);
  background:var(--surface-card); font-family:var(--font-mono); font-size:12.5px; }
.dtm-live__feed .nm{ display:flex; align-items:center; gap:9px; color:var(--text-primary); }
.dtm-live__feed .dot{ width:7px; height:7px; border-radius:50%; background:var(--text-tertiary);
  transition:background var(--dur-base) var(--ease-out); }
.dtm-live__feed .dot[data-on="green"]{ background:var(--green); }
.dtm-live__feed .meta{ font-size:11px; color:var(--text-tertiary); }

.dtm-live__card{ position:relative; overflow:hidden; border:1px solid var(--border-hairline);
  border-radius:var(--radius-md); background:var(--surface-card);
  max-height:0; opacity:0; margin-top:0;
  transition:max-height .42s cubic-bezier(.16,1,.3,1), opacity .42s cubic-bezier(.16,1,.3,1), margin-top .42s; }
.dtm-live__card[data-open="true"]{ max-height:640px; opacity:1; margin-top:12px; }

/* the single left-edge ripple — retriggered by key, never looped */
.dtm-live__ripple{ position:absolute; left:-1px; top:50%; width:18px; height:18px; border-radius:50%;
  border:1.5px solid var(--amber); transform:translate(-50%,-50%) scale(.3); opacity:0; pointer-events:none; z-index:4; }
.dtm-live__ripple[data-fire="true"]{ animation:dtm-ripple .64s var(--ease-out) 1; }
@keyframes dtm-ripple{ 0%{transform:translate(-50%,-50%) scale(.3);opacity:.5} 100%{transform:translate(-50%,-50%) scale(5);opacity:0} }

.dtm-live__head{ display:flex; align-items:center; justify-content:space-between; padding:11px 16px;
  background:var(--surface-raised); transition:background .3s var(--ease-out); }
.dtm-live__head[data-tint="amber"]{ background:var(--signal-amber-tint); }
.dtm-live__head[data-tint="red"]{ background:var(--signal-red-tint); }
.dtm-live__head[data-tint="neutral"]{ background:var(--surface-raised); }
.dtm-live__head[data-tint="green"]{ background:var(--signal-green-tint); }
.dtm-live__title{ display:flex; align-items:center; gap:8px; font-family:var(--font-mono); font-size:13.5px;
  color:var(--text-primary); transition:color .3s; }
.dtm-live__title .to{ color:var(--signal-amber); }
.dtm-live__title svg{ width:14px; height:14px; flex:none; }
.dtm-live__head[data-tint="amber"] .dtm-live__title{ color:var(--signal-amber); }
.dtm-live__head[data-tint="red"] .dtm-live__title{ color:var(--signal-red); }
.dtm-live__head[data-tint="green"] .dtm-live__title{ color:var(--signal-green); }
.dtm-live__time{ font-family:var(--font-mono); font-size:11px; color:var(--text-tertiary); }

.dtm-live__body{ padding:13px 16px; }

.dtm-live__chips{ display:flex; gap:6px; flex-wrap:wrap; margin-bottom:13px; }
.dtm-live__chip{ display:inline-flex; align-items:center; gap:6px; height:24px; padding:0 9px;
  border-radius:var(--radius-xs); font-family:var(--font-mono); font-size:11px;
  border:1px solid var(--border-hairline); color:var(--text-tertiary); background:transparent;
  transition:all .24s var(--ease-out); white-space:nowrap; }
.dtm-live__chip svg{ width:11px; height:11px; flex:none; }
.dtm-live__chip[data-s="ghost"]{ opacity:.42; border-style:dashed; }
.dtm-live__chip[data-s="complete"]{ color:var(--text-tertiary); border-color:var(--border-hairline); background:var(--surface-card); }
.dtm-live__chip[data-s="complete"] .ic{ display:none; }
.dtm-live__chip .cdot{ width:6px; height:6px; border-radius:50%; flex:none; display:none; }
.dtm-live__chip[data-s="complete"] .cdot{ display:inline-block; }
.dtm-live__chip[data-s="active"][data-c="amber"]{ color:var(--signal-amber); border-color:var(--signal-amber-line); background:var(--signal-amber-tint); }
.dtm-live__chip[data-s="active"][data-c="red"]{ color:var(--signal-red); border-color:var(--signal-red-line); background:var(--signal-red-tint); }
.dtm-live__chip[data-s="active"][data-c="blue"]{ color:var(--signal-blue); border-color:var(--signal-blue-line); background:var(--signal-blue-tint); }
.dtm-live__chip[data-s="active"][data-c="green"]{ color:var(--signal-green); border-color:var(--signal-green-line); background:var(--signal-green-tint); }

.dtm-live__why{ font-size:13px; color:var(--text-secondary); line-height:1.5; margin:0 0 11px; }
.dtm-live__why .who{ color:var(--text-tertiary); }
.dtm-live__change{ display:inline-flex; align-items:center; gap:8px; margin-top:9px;
  font-family:var(--font-mono); font-size:12.5px; background:var(--bg-inset);
  border:1px solid var(--border-hairline); border-radius:var(--radius-sm); padding:6px 10px; }
.dtm-live__strike{ position:relative; color:var(--text-primary); transition:color .25s; }
.dtm-live__strike::after{ content:""; position:absolute; left:0; top:50%; height:1px; width:0;
  background:currentColor; transition:width .2s var(--ease-out); }
.dtm-live__strike[data-struck="true"]{ color:var(--text-tertiary); }
.dtm-live__strike[data-struck="true"]::after{ width:100%; }
.dtm-live__change .arr{ color:var(--text-tertiary); }
.dtm-live__change .new{ color:var(--text-primary); }
.dtm-live__change .mig{ color:var(--text-tertiary); }

.dtm-live__radius{ margin-top:4px; }
.dtm-live__foot{ max-height:0; opacity:0; overflow:hidden; margin-top:0;
  transition:max-height .3s var(--ease-out), opacity .3s, margin-top .3s; }
.dtm-live__foot[data-open="true"]{ max-height:60px; opacity:1; margin-top:12px; }
.dtm-live__foot-in{ display:flex; align-items:center; gap:14px; padding-top:11px;
  border-top:1px solid var(--border-hairline); font-family:var(--font-mono); font-size:12px; }
.dtm-live__link{ display:inline-flex; align-items:center; gap:6px; color:var(--signal-blue); cursor:pointer; }
.dtm-live__link svg{ width:12px; height:12px; }
.dtm-live__link .gd{ color:var(--signal-green); }

@media (prefers-reduced-motion: reduce){
  .dtm-live__card, .dtm-live__head, .dtm-live__chip, .dtm-live__strike, .dtm-live__strike::after,
  .dtm-live__foot, .dtm-live__feed .dot{ transition:opacity .12s linear !important; }
  .dtm-live__ripple{ display:none !important; }
}
`;

let injected = false;
function inject(){
  if (injected || typeof document === "undefined") return;
  injected = true;
  const s = document.createElement("style");
  s.setAttribute("data-dtm", "livedrift");
  s.textContent = CSS;
  document.head.appendChild(s);
}

const Ic = {
  detected: <path d="M8 1.8 14.4 13H1.6z M8 6.2v3.4 M8 11h.01" />,
  fenced: <path d="M3 3h10v10H3z M3 6.5h10 M6.2 3v10" />,
  advised: <path d="M8 1.8a6.2 6.2 0 100 12.4 6.2 6.2 0 000-12.4 M8 5.2v3.4 M8 11h.01" />,
  reconciled: <path d="M2.5 8.4 6 11.8l7.5-7.6" />,
  pr: <g><circle cx="4" cy="4" r="2" /><circle cx="4" cy="12" r="2" /><circle cx="12" cy="12" r="2" /><path d="M4 6v4M12 10V8a2 2 0 00-2-2H7" strokeLinecap="round" /></g>,
};
function ChipIcon({ k }) {
  return <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" className="ic">{Ic[k] || Ic.detected}</svg>;
}

const STAGES = ["calm", "detected", "fenced", "advised", "reconciling", "reconciled", "patched"];
const HEX = { amber: "var(--amber)", red: "var(--red)", blue: "var(--blue)", green: "var(--green)" };

// chip lifecycle resolved from the current stage
function chipState(idxOf, stage, chipName) {
  const cur = idxOf(stage);
  if (chipName === "reconcile") {
    if (cur < idxOf("reconciling")) return "ghost";
    if (stage === "reconciling" || stage === "reconciled") return "active";
    return "complete"; // patched
  }
  if (chipName === "pr") return stage === "patched" ? "active" : "ghost";
  const map = { detected: "detected", fenced: "fenced", advised: "advised" };
  const own = idxOf(map[chipName]);
  if (cur < own) return "ghost";
  if (cur === own) return "active";
  return "complete";
}

// header tint per the spec's escalate→de-escalate→settle arc
const TINT = { calm: "neutral", detected: "amber", fenced: "red", advised: "neutral", reconciling: "neutral", reconciled: "green", patched: "green" };

export const LiveDriftCard = React.forwardRef(function LiveDriftCard({
  contract = "db.users",
  fromVersion = "v7",
  toVersion = "v8",
  timestamp = "14:02:11",
  quote = { who: "asha", text: "phone signups make email the wrong name." },
  change = { from: "users.email", to: "contact_email", migration: "migration 0042" },
  nodes = [
    { initials: "be", who: "ben", label: "routes/users.ts" },
    { initials: "ch", who: "chen", label: "UserCard.tsx" },
  ],
  pr = { label: "spec PR #14" },
  ledger = { label: "ledger #112" },
  autoPlay = false,
  loop = false,
  onStageChange = null,
  className = "",
  ...rest
}, ref) {
  inject();
  const [stage, setStage] = React.useState("calm");
  const [recCount, setRecCount] = React.useState(0);
  const [ben, setBen] = React.useState("neutral");   // neutral | fenced | reconciled
  const [chen, setChen] = React.useState("neutral"); // neutral | advised | reconciled
  const [rippleKey, setRippleKey] = React.useState(0);
  const [punch, setPunch] = React.useState(null);     // "center" | "ben" | "settle"
  const timers = React.useRef([]);
  const idxOf = React.useCallback((s) => STAGES.indexOf(s), []);

  React.useEffect(() => { if (onStageChange) onStageChange(stage); }, [stage, onStageChange]);

  const clearTimers = React.useCallback(() => { timers.current.forEach(clearTimeout); timers.current = []; }, []);
  const at = React.useCallback((ms, fn) => { timers.current.push(setTimeout(fn, ms)); }, []);

  const reset = React.useCallback(() => {
    clearTimers();
    setStage("calm"); setRecCount(0); setBen("neutral"); setChen("neutral"); setPunch(null);
  }, [clearTimers]);

  // one apply() for every event — the single source of state transition
  const emit = React.useCallback((event) => {
    switch (event) {
      case "delta.detected":
        setStage("detected"); setRippleKey((k) => k + 1); setPunch("center");
        setTimeout(() => setPunch(null), 520); break;
      case "write.fenced":
        setStage("fenced"); setBen("fenced"); setPunch("ben");
        setTimeout(() => setPunch((p) => (p === "ben" ? null : p)), 220); break;
      case "advisory.delivered":
        setStage("advised"); setChen("advised"); break;
      case "reconcile.ben":
        setStage("reconciling"); setBen("reconciled"); setRecCount(1); break;
      case "reconcile.chen":
        setChen("reconciled"); setRecCount(2); setStage("reconciled"); setPunch("settle");
        setTimeout(() => setPunch(null), 540); break;
      case "spec.pr.opened":
        setStage("patched"); break;
      case "reset": reset(); break;
      default: break;
    }
  }, [reset]);

  // scripted emitter — compressed ~8s timeline. Elapsed labels stay the REAL
  // numbers; only wall-clock pacing is compressed (honest time-lapse).
  const fire = React.useCallback(() => {
    clearTimers(); reset();
    at(60, () => emit("delta.detected"));
    at(1200, () => emit("write.fenced"));
    at(2000, () => emit("advisory.delivered"));
    at(3500, () => emit("reconcile.ben"));
    at(4800, () => emit("reconcile.chen"));
    at(6200, () => emit("spec.pr.opened"));
    if (loop) at(9000, () => fire());
  }, [at, clearTimers, emit, reset, loop]);

  React.useImperativeHandle(ref, () => ({ fire, reset, emit, getStage: () => stage }), [fire, reset, emit, stage]);

  React.useEffect(() => {
    if (autoPlay) { const t = setTimeout(fire, 500); return () => { clearTimeout(t); clearTimers(); }; }
    return () => clearTimers();
    // eslint-disable-next-line
  }, [autoPlay]);

  // always clear pending timers on unmount (ref-driven kit may unmount mid-arc)
  React.useEffect(() => () => clearTimers(), [clearTimers]);

  const open = stage !== "calm";
  const tint = TINT[stage];
  const benCol = ben === "fenced" ? "red" : ben === "reconciled" ? "green" : null;
  const chenCol = chen === "advised" ? "blue" : chen === "reconciled" ? "green" : null;

  const chips = [
    { name: "detected", label: "detected", elapsed: "0.3s", color: "amber", icon: "detected" },
    { name: "fenced", label: "fenced", elapsed: "5.8s", color: "red", icon: "fenced" },
    { name: "advised", label: "advised", elapsed: "6.4s", color: "blue", icon: "advised" },
    { name: "reconcile", label: recCount >= 2 ? "reconciled" : "reconciling", elapsed: `${recCount}/2`, color: "green", icon: "reconciled" },
    { name: "pr", label: pr ? pr.label : "spec PR", elapsed: "14:04", color: "blue", icon: "pr" },
  ];

  return (
    <div className={["dtm-live", className].filter(Boolean).join(" ")} {...rest}>
      {!open && (
        <div className="dtm-live__feed">
          <span className="nm"><span className="dot" data-on={stage === "calm" && recCount >= 2 ? "green" : "gray"} />{contract}</span>
          <span className="meta">calm · synced to {fromVersion}</span>
        </div>
      )}

      <div className="dtm-live__card" data-open={open}>
        <span key={rippleKey} className="dtm-live__ripple" data-fire={rippleKey > 0} />

        <div className="dtm-live__head" data-tint={tint}>
          <span className="dtm-live__title">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4"><circle cx="8" cy="8" r="6.4" /><circle cx="8" cy="8" r="1.8" fill="currentColor" stroke="none" /></svg>
            contract delta · {contract} {fromVersion} → <span className="to">{toVersion}</span>
          </span>
          <span className="dtm-live__time">{timestamp}</span>
        </div>

        <div className="dtm-live__body">
          <div className="dtm-live__chips">
            {chips.map((c) => {
              const s = chipState(idxOf, stage, c.name);
              const showElapsed = c.name === "pr" ? s === "active" : (s !== "ghost");
              return (
                <span key={c.name} className="dtm-live__chip" data-s={s} data-c={c.color}>
                  <ChipIcon k={c.icon} />
                  <span className="cdot" style={{ background: HEX[c.color] }} />
                  <span>{c.label}</span>
                  {showElapsed && <span style={{ color: "var(--text-tertiary)", fontFeatureSettings: '"tnum" 1' }}>{c.elapsed}</span>}
                </span>
              );
            })}
          </div>

          <p className="dtm-live__why">
            <span className="who">{quote.who}:</span> "{quote.text}"
          </p>
          <div className="dtm-live__change">
            <span className="dtm-live__strike" data-struck={idxOf(stage) >= idxOf("fenced")}>{change.from}</span>
            <span className="arr">→</span>
            <span className="new">{change.to}</span>
            {change.migration && <span className="mig">· {change.migration}</span>}
          </div>

          <div className="dtm-live__radius">
            <BlastSVG
              delta={toVersion} open={open} punch={punch}
              nodes={[
                { ...nodes[0], col: benCol, status: ben === "fenced" ? "fenced" : ben === "reconciled" ? "reconciled" : "building" },
                { ...nodes[1], col: chenCol, status: chen === "advised" ? "advised" : chen === "reconciled" ? "reconciled" : "building" },
              ]}
            />
          </div>

          <div className="dtm-live__foot" data-open={stage === "patched"}>
            <div className="dtm-live__foot-in">
              {pr && <span className="dtm-live__link"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3"><circle cx="4" cy="4" r="2" /><circle cx="4" cy="12" r="2" /><circle cx="12" cy="12" r="2" /><path d="M4 6v4M12 10V8a2 2 0 00-2-2H7" strokeLinecap="round" /></svg>{pr.label} <span className="gd">open</span></span>}
              {ledger && <span className="dtm-live__link" style={{ color: "var(--text-secondary)" }}>{ledger.label}</span>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});

/* the animated blast radius — node colors, line draw, fence punch, settle pulse.
   Geometry matches the static BlastRadius (tight fan, big labels, no rings). */
function BlastSVG({ delta, nodes, punch, open }) {
  const W = 380, H = 132;
  const cx = 70, cy = H / 2, R = 92;
  const pts = [
    { ...nodes[0], x: cx + R * Math.cos(-0.30), y: cy + R * Math.sin(-0.30) },
    { ...nodes[1], x: cx + R * Math.cos(0.30), y: cy + R * Math.sin(0.30) },
  ];
  const LABEL = { building: "building", fenced: "fenced", advised: "advised", reconciled: "reconciled" };
  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="blast radius">
      {pts.map((p, i) => {
        const len = Math.hypot(p.x - cx, p.y - cy);
        const col = p.col ? HEX[p.col] : "var(--border-strong)";
        return (
          <line key={"l" + i} x1={cx} y1={cy} x2={p.x} y2={p.y} stroke={col} strokeWidth="2"
            strokeDasharray={len} strokeDashoffset={open ? 0 : len}
            style={{ transition: `stroke-dashoffset .32s ease-out ${i * 0.08}s, stroke .36s` }} />
        );
      })}

      {/* settle pulse across the whole graphic */}
      {punch === "settle" && (
        <circle cx={cx} cy={cy} r="22" fill="none" stroke="var(--green)" strokeWidth="1.5">
          <animate attributeName="r" from="22" to={R + 30} dur="0.52s" begin="0s" fill="freeze" />
          <animate attributeName="opacity" from="0.6" to="0" dur="0.52s" begin="0s" fill="freeze" />
        </circle>
      )}

      {/* center delta */}
      <circle cx={cx} cy={cy} r="19" fill="var(--signal-amber-tint)" stroke="var(--signal-amber-line)" strokeWidth="1.5"
        style={{ transformBox: "fill-box", transformOrigin: "center", transform: punch === "center" ? "scale(1.16)" : "scale(1)", transition: "transform .5s var(--ease-out)" }} />
      <circle cx={cx} cy={cy} r="7" fill="var(--amber)">
        {open && <animate attributeName="opacity" values="1;0.55;1" dur="2s" repeatCount="indefinite" />}
      </circle>
      <text x={cx} y={cy - 28} textAnchor="middle" fontFamily="var(--font-mono)" fontSize="15" fontWeight="600" fill="var(--signal-amber)">{delta}</text>

      {/* consumer nodes */}
      {pts.map((p, i) => {
        const col = p.col ? HEX[p.col] : "var(--text-tertiary)";
        const stroke = p.col ? HEX[p.col] : "var(--border-strong)";
        const punched = punch === "ben" && i === 0;
        return (
          <g key={"n" + i}>
            <circle cx={p.x} cy={p.y} r="17" fill="var(--surface-raised)" stroke={stroke} strokeWidth="2"
              style={{ transformBox: "fill-box", transformOrigin: "center", transform: punched ? "scale(1.25)" : "scale(1)", transition: "transform .2s cubic-bezier(.34,1.56,.64,1), stroke .36s" }} />
            <text x={p.x} y={p.y + 4.5} textAnchor="middle" fontFamily="var(--font-mono)" fontSize="13" fill="var(--text-primary)">{p.initials}</text>
            <text x={p.x + 24} y={p.y - 2} textAnchor="start" fontFamily="var(--font-mono)" fontSize="13" fontWeight="500" fill="var(--text-primary)">{p.who} · {p.label}</text>
            <text x={p.x + 24} y={p.y + 14} textAnchor="start" fontFamily="var(--font-mono)" fontSize="12" fill={col} style={{ transition: "fill .36s" }}>{LABEL[p.status] || p.status}</text>
          </g>
        );
      })}
    </svg>
  );
}
