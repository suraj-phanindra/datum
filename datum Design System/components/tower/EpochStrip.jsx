import React from "react";

const CSS = `
.dtm-epoch{ display:flex; align-items:center; gap:0; font-family:var(--font-mono); }
.dtm-epoch--times{ padding-bottom:15px; }
.dtm-epoch__node{ display:flex; flex-direction:column; align-items:center; gap:6px; position:relative; }
.dtm-epoch__dot{ width:9px; height:9px; border-radius:50%; background:var(--border-strong);
  border:1.5px solid var(--bg-base); position:relative; z-index:2; }
.dtm-epoch__dot--past{ background:var(--text-tertiary); }
.dtm-epoch__dot--live{ background:var(--amber); box-shadow:0 0 0 4px var(--signal-amber-tint); }
.dtm-epoch__dot--live::after{ content:""; position:absolute; inset:-1.5px; border-radius:50%;
  border:1.5px solid var(--amber); animation:dtm-epoch-pulse 2s var(--ease-out) infinite; }
@keyframes dtm-epoch-pulse{ 0%{transform:scale(1);opacity:.7} 100%{transform:scale(2.4);opacity:0} }
@media (prefers-reduced-motion:reduce){ .dtm-epoch__dot--live::after{ animation:none; } }
.dtm-epoch__seg{ height:1.5px; width:34px; background:var(--border-hairline); margin-bottom:18px; }
.dtm-epoch__seg--live{ background:linear-gradient(90deg,var(--text-tertiary),var(--amber)); }
.dtm-epoch__v{ font-size:11px; color:var(--text-tertiary); }
.dtm-epoch__v--live{ color:var(--signal-amber); font-weight:var(--fw-medium); }
.dtm-epoch__t{ font-size:9.5px; color:var(--text-tertiary); position:absolute; top:33px; white-space:nowrap; }

/* version tick — the newly-live node + its connector arrive (epoch.tick) */
.dtm-epoch--tick .dtm-epoch__node:last-child{ animation:dtm-epoch-in .48s cubic-bezier(.65,0,.35,1) both; }
.dtm-epoch--tick .dtm-epoch__seg:last-of-type{ animation:dtm-epoch-seg .48s cubic-bezier(.65,0,.35,1) both; transform-origin:left center; }
@keyframes dtm-epoch-in{ from{opacity:0; transform:translateX(-8px);} to{opacity:1; transform:translateX(0);} }
@keyframes dtm-epoch-seg{ from{transform:scaleX(0);} to{transform:scaleX(1);} }
@media (prefers-reduced-motion:reduce){
  .dtm-epoch--tick .dtm-epoch__node:last-child,
  .dtm-epoch--tick .dtm-epoch__seg:last-of-type{ animation:none; }
}
`;

let injected = false;
function inject(){
  if (injected || typeof document === "undefined") return;
  injected = true;
  const s = document.createElement("style");
  s.setAttribute("data-dtm", "epoch");
  s.textContent = CSS;
  document.head.appendChild(s);
}

/**
 * datum EpochStrip — the version spine that appears on every tower surface.
 * Truth has a version number; the live epoch is the only amber node.
 */
export function EpochStrip({ versions = [], showTimes = false, animateLive = false, className = "", ...rest }) {
  inject();
  return (
    <div className={["dtm-epoch", showTimes ? "dtm-epoch--times" : "", animateLive ? "dtm-epoch--tick" : "", className].filter(Boolean).join(" ")} {...rest}>
      {versions.map((node, i) => {
        const live = node.state === "live";
        const past = node.state === "past" || (!live && i < versions.length - 1);
        return (
          <React.Fragment key={node.v}>
            {i > 0 && (
              <div className={"dtm-epoch__seg" + (versions[i].state === "live" ? " dtm-epoch__seg--live" : "")} />
            )}
            <div className="dtm-epoch__node">
              <span className={"dtm-epoch__dot" + (live ? " dtm-epoch__dot--live" : past ? " dtm-epoch__dot--past" : "")} />
              <span className={"dtm-epoch__v" + (live ? " dtm-epoch__v--live" : "")}>{node.v}</span>
              {showTimes && node.time && <span className="dtm-epoch__t">{node.time}</span>}
            </div>
          </React.Fragment>
        );
      })}
    </div>
  );
}
