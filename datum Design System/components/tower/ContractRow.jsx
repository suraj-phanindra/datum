import React from "react";
import { PresenceStack } from "./PresenceAvatar.jsx";

const CSS = `
.dtm-crow{ display:flex; align-items:center; gap:12px; padding:9px 12px;
  border-bottom:1px solid var(--border-hairline); background:transparent;
  transition:background var(--dur-fast) var(--ease-out); }
.dtm-crow:last-child{ border-bottom:0; }
.dtm-crow--interactive{ cursor:pointer; }
.dtm-crow--interactive:hover{ background:var(--surface-raised); }
.dtm-crow__name{ font-family:var(--font-mono); font-size:13px; color:var(--text-primary);
  display:flex; align-items:center; gap:8px; min-width:0; }
.dtm-crow__name .ico{ color:var(--text-tertiary); display:inline-flex; flex:none; }
.dtm-crow__name .ico svg{ width:13px; height:13px; display:block; }
.dtm-crow__spacer{ flex:1; }
.dtm-crow__ver{ font-family:var(--font-mono); font-size:12px; color:var(--text-tertiary);
  font-feature-settings:"tnum" 1; min-width:30px; text-align:right; }
.dtm-crow__ver--live{ color:var(--signal-amber); font-weight:var(--fw-medium); }
.dtm-crow__drift{ width:6px; height:6px; border-radius:50%; background:var(--amber); flex:none; }
`;

let injected = false;
function inject(){
  if (injected || typeof document === "undefined") return;
  injected = true;
  const s = document.createElement("style");
  s.setAttribute("data-dtm", "contractrow");
  s.textContent = CSS;
  document.head.appendChild(s);
}

const Contract = () => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 2h5l3 3v9H4z" /><path d="M9 2v3h3" /><path d="M6 8.5h4M6 11h4" />
  </svg>
);

/**
 * datum ContractRow — one line in the current-truth registry: the contract
 * identifier, the sessions parked on it (presence), and its live version.
 */
export function ContractRow({ name, version, live = false, drift = false, sessions = [], interactive = true, onClick, className = "", ...rest }) {
  inject();
  const cls = ["dtm-crow", interactive ? "dtm-crow--interactive" : "", className].filter(Boolean).join(" ");
  return (
    <div className={cls} onClick={onClick} {...rest}>
      <span className="dtm-crow__name">
        <span className="ico"><Contract /></span>
        {name}
        {drift && <span className="dtm-crow__drift" title="drifting" />}
      </span>
      <span className="dtm-crow__spacer" />
      {sessions.length > 0 && <PresenceStack sessions={sessions} size="sm" max={3} />}
      <span className={"dtm-crow__ver" + (live ? " dtm-crow__ver--live" : "")}>{version}</span>
    </div>
  );
}
