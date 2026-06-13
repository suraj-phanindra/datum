import React from "react";

const CSS = `
.dtm-ledger{ display:flex; align-items:baseline; gap:9px; padding:8px 12px;
  border-bottom:1px solid var(--border-hairline); font-family:var(--font-mono); font-size:12px;
  transition:background var(--dur-fast); }
.dtm-ledger:last-child{ border-bottom:0; }
.dtm-ledger--interactive{ cursor:pointer; }
.dtm-ledger--interactive:hover{ background:var(--surface-raised); }
.dtm-ledger__id{ color:var(--text-tertiary); flex:none; }
.dtm-ledger__time{ color:var(--text-tertiary); flex:none; font-feature-settings:"tnum" 1; }
.dtm-ledger__who{ color:var(--text-primary); flex:none; }
.dtm-ledger__sep{ color:var(--text-tertiary); flex:none; }
.dtm-ledger__sum{ color:var(--text-secondary); min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.dtm-ledger__sum .amber{ color:var(--signal-amber); }
.dtm-ledger--head .dtm-ledger__sum{ color:var(--text-primary); }
`;

let injected = false;
function inject(){
  if (injected || typeof document === "undefined") return;
  injected = true;
  const s = document.createElement("style");
  s.setAttribute("data-dtm", "ledger");
  s.textContent = CSS;
  document.head.appendChild(s);
}

/**
 * datum LedgerEntry — one append-only line in the decision history.
 * Every assertion carries who, when, why.
 */
export function LedgerEntry({ id, time, who, summary, head = false, interactive = true, onClick, className = "", ...rest }) {
  inject();
  const cls = ["dtm-ledger", head ? "dtm-ledger--head" : "", interactive ? "dtm-ledger--interactive" : "", className].filter(Boolean).join(" ");
  return (
    <div className={cls} onClick={onClick} {...rest}>
      {id != null && <span className="dtm-ledger__id">#{id}</span>}
      {time && <span className="dtm-ledger__time">{time}</span>}
      {who && <span className="dtm-ledger__who">{who}</span>}
      <span className="dtm-ledger__sep">·</span>
      <span className="dtm-ledger__sum">{summary}</span>
    </div>
  );
}
