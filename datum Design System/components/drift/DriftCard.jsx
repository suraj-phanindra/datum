import React from "react";
import { LifecycleChip } from "../tower/LifecycleChip.jsx";
import { BlastRadius } from "./BlastRadius.jsx";

const CSS = `
.dtm-drift{ background:var(--surface-card); border:1px solid var(--border-hairline);
  border-radius:var(--radius-md); overflow:hidden; }
.dtm-drift--amber{ border-top:2px solid var(--amber); }
.dtm-drift--red{ border-top:2px solid var(--red); }

/* collapsed — one calm line in the feed */
.dtm-drift__line{ display:flex; align-items:center; gap:10px; padding:11px 14px; cursor:pointer;
  font-family:var(--font-mono); font-size:12.5px; transition:background var(--dur-fast); }
.dtm-drift__line:hover{ background:var(--surface-raised); }
.dtm-drift__sev{ width:7px; height:7px; border-radius:50%; flex:none; }
.dtm-drift__sev--amber{ background:var(--amber); }
.dtm-drift__sev--red{ background:var(--red); }
.dtm-drift__name{ color:var(--text-primary); }
.dtm-drift__trans{ color:var(--text-tertiary); }
.dtm-drift__trans .to{ color:var(--signal-amber); }
.dtm-drift__time{ color:var(--text-tertiary); margin-left:auto; font-feature-settings:"tnum" 1; }
.dtm-drift__chev{ color:var(--text-tertiary); display:inline-flex; }
.dtm-drift__chev svg{ width:13px; height:13px; display:block; transition:transform var(--dur-base) var(--ease-out); }
.dtm-drift--open .dtm-drift__chev svg{ transform:rotate(180deg); }

/* expanded */
.dtm-drift__head{ display:flex; align-items:flex-start; gap:12px; padding:14px 16px 12px;
  border-bottom:1px solid var(--border-hairline); }
.dtm-drift__eyebrow{ font-family:var(--font-mono); font-size:10px; letter-spacing:.06em;
  text-transform:uppercase; color:var(--text-tertiary); margin-bottom:5px; }
.dtm-drift__title{ font-family:var(--font-mono); font-size:16px; color:var(--text-primary); display:flex; align-items:center; gap:9px; flex-wrap:wrap; }
.dtm-drift__title .trans{ color:var(--text-tertiary); font-size:14px; }
.dtm-drift__title .to{ color:var(--signal-amber); }
.dtm-drift__ts{ margin-left:auto; font-family:var(--font-mono); font-size:11px; color:var(--text-tertiary); text-align:right; white-space:nowrap; }

.dtm-drift__life{ display:flex; gap:7px; flex-wrap:wrap; padding:12px 16px; border-bottom:1px solid var(--border-hairline); }

.dtm-drift__why{ padding:13px 16px; border-bottom:1px solid var(--border-hairline); }
.dtm-drift__quote{ font-family:var(--font-sans); font-size:13.5px; color:var(--text-primary); line-height:1.45; }
.dtm-drift__quote .who{ color:var(--text-tertiary); }
.dtm-drift__change{ margin-top:9px; display:inline-flex; align-items:center; gap:8px;
  font-family:var(--font-mono); font-size:12.5px; background:var(--bg-inset);
  border:1px solid var(--border-hairline); border-radius:var(--radius-sm); padding:6px 10px; }
.dtm-drift__change .old{ color:var(--text-tertiary); text-decoration:line-through; }
.dtm-drift__change .arr{ color:var(--text-tertiary); }
.dtm-drift__change .new{ color:var(--text-primary); }
.dtm-drift__change .mig{ color:var(--text-tertiary); margin-left:4px; }

.dtm-drift__radius{ display:flex; justify-content:center; padding:8px 12px 14px; border-bottom:1px solid var(--border-hairline); }

.dtm-drift__foot{ display:flex; align-items:center; gap:14px; padding:11px 16px; font-family:var(--font-mono); font-size:12px; }
.dtm-drift__link{ display:inline-flex; align-items:center; gap:6px; color:var(--text-secondary); cursor:pointer; }
.dtm-drift__link:hover{ color:var(--text-primary); }
.dtm-drift__link svg{ width:12px; height:12px; }
.dtm-drift__link .gd{ color:var(--signal-green); }
.dtm-drift__foot-sp{ margin-left:auto; color:var(--text-tertiary); }
`;

let injected = false;
function inject(){
  if (injected || typeof document === "undefined") return;
  injected = true;
  const s = document.createElement("style");
  s.setAttribute("data-dtm", "driftcard");
  s.textContent = CSS;
  document.head.appendChild(s);
}

const Chevron = () => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><path d="M4 6l4 4 4-4" /></svg>
);
const PR = () => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3"><circle cx="4" cy="4" r="2" /><circle cx="4" cy="12" r="2" /><circle cx="12" cy="12" r="2" /><path d="M4 6v4M12 10V8a2 2 0 00-2-2H7" strokeLinecap="round" /></svg>
);
const Book = () => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3"><path d="M3 3h7a2 2 0 012 2v8H5a2 2 0 00-2 2z" /><path d="M12 5v8" /></svg>
);

/**
 * datum DriftCard — the hero component. A contract delta is a mini-incident
 * with a lifecycle. Collapsed it is one calm line in the feed; expanded
 * during live drift it owns the screen (header, lifecycle chips, the why,
 * the blast-radius graphic, resolution footer).
 */
export function DriftCard({
  contract = "db.users",
  fromVersion = "v7",
  toVersion = "v8",
  timestamp = "14:02",
  severity = "red",
  quote = null,
  change = null,
  lifecycle = [],
  nodes = [],
  pr = null,
  ledger = null,
  defaultOpen = true,
  className = "",
  ...rest
}) {
  inject();
  const [open, setOpen] = React.useState(defaultOpen);

  const root = ["dtm-drift", `dtm-drift--${severity}`, open ? "dtm-drift--open" : "", className].filter(Boolean).join(" ");

  if (!open) {
    return (
      <div className={root} {...rest}>
        <div className="dtm-drift__line" onClick={() => setOpen(true)} role="button" tabIndex={0}>
          <span className={`dtm-drift__sev dtm-drift__sev--${severity}`} />
          <span className="dtm-drift__name">{contract}</span>
          <span className="dtm-drift__trans">{fromVersion} → <span className="to">{toVersion}</span></span>
          <span className="dtm-drift__time">{timestamp}</span>
          <span className="dtm-drift__chev"><Chevron /></span>
        </div>
      </div>
    );
  }

  return (
    <div className={root} {...rest}>
      <div className="dtm-drift__head">
        <div style={{ minWidth: 0 }}>
          <div className="dtm-drift__eyebrow">contract delta</div>
          <div className="dtm-drift__title">
            {contract}
            <span className="trans">{fromVersion} → <span className="to">{toVersion}</span></span>
          </div>
        </div>
        <div className="dtm-drift__ts">
          {timestamp}
          <div className="dtm-drift__chev" style={{ float: "right", marginLeft: 8, cursor: "pointer" }} onClick={() => setOpen(false)}><Chevron /></div>
        </div>
      </div>

      {lifecycle.length > 0 && (() => {
        // the live edge is the explicitly-current stage, else the last
        // completed (non-pending) one. Everything before it recedes.
        let currentIdx = lifecycle.findIndex((s) => s.current);
        if (currentIdx < 0) {
          for (let i = 0; i < lifecycle.length; i++) if (!lifecycle[i].pending) currentIdx = i;
        }
        return (
          <div className="dtm-drift__life">
            {lifecycle.map((s, i) => (
              <LifecycleChip key={i} stage={s.stage} elapsed={s.elapsed} label={s.label}
                pending={s.pending} done={!s.pending && i !== currentIdx} />
            ))}
          </div>
        );
      })()}

      {(quote || change) && (
        <div className="dtm-drift__why">
          {quote && (
            <div className="dtm-drift__quote">
              "{quote.text}" <span className="who">— {quote.who}</span>
            </div>
          )}
          {change && (
            <div className="dtm-drift__change">
              <span className="old">{change.from}</span>
              <span className="arr">→</span>
              <span className="new">{change.to}</span>
              {change.migration && <span className="mig">· {change.migration}</span>}
            </div>
          )}
        </div>
      )}

      {nodes.length > 0 && (
        <div className="dtm-drift__radius">
          <BlastRadius delta={toVersion} nodes={nodes} />
        </div>
      )}

      {(pr || ledger) && (
        <div className="dtm-drift__foot">
          {pr && <span className="dtm-drift__link" onClick={pr.onClick}><PR /> {pr.label} <span className="gd">open</span></span>}
          {ledger && <span className="dtm-drift__link" onClick={ledger.onClick}><Book /> {ledger.label}</span>}
          <span className="dtm-drift__foot-sp">re-baselined</span>
        </div>
      )}
    </div>
  );
}
