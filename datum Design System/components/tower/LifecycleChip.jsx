import React from "react";

const CSS = `
.dtm-life{ display:inline-flex; align-items:center; gap:7px; height:24px; padding:0 9px;
  border-radius:var(--radius-xs); font-family:var(--font-mono); font-size:11px;
  border:1px solid var(--border-hairline); background:var(--surface-card); color:var(--text-secondary); white-space:nowrap; }
.dtm-life__icon{ display:inline-flex; }
.dtm-life__icon svg{ width:12px; height:12px; display:block; }
.dtm-life__elapsed{ color:var(--text-tertiary); font-feature-settings:"tnum" 1; }
.dtm-life--pending{ opacity:.5; border-style:dashed; }

/* completed stages recede: low-contrast gray, a small colored dot for the hue */
.dtm-life--done{ color:var(--text-tertiary); border-color:var(--border-hairline); background:var(--surface-card); }
.dtm-life--done .dtm-life__elapsed{ color:var(--text-tertiary); }
.dtm-life__dot{ width:7px; height:7px; border-radius:50%; flex:none; }

.dtm-life--detected{ color:var(--signal-amber); border-color:var(--signal-amber-line); background:var(--signal-amber-tint); }
.dtm-life--detected .dtm-life__elapsed{ color:color-mix(in srgb,var(--signal-amber) 70%,transparent); }
.dtm-life--fenced{ color:var(--signal-red); border-color:var(--signal-red-line); background:var(--signal-red-tint); }
.dtm-life--fenced .dtm-life__elapsed{ color:color-mix(in srgb,var(--signal-red) 70%,transparent); }
.dtm-life--advised{ color:var(--signal-blue); border-color:var(--signal-blue-line); background:var(--signal-blue-tint); }
.dtm-life--advised .dtm-life__elapsed{ color:color-mix(in srgb,var(--signal-blue) 70%,transparent); }
.dtm-life--reconciled,.dtm-life--patched{ color:var(--signal-green); border-color:var(--signal-green-line); background:var(--signal-green-tint); }
.dtm-life--reconciled .dtm-life__elapsed,.dtm-life--patched .dtm-life__elapsed{ color:color-mix(in srgb,var(--signal-green) 70%,transparent); }
`;

let injected = false;
function inject(){
  if (injected || typeof document === "undefined") return;
  injected = true;
  const s = document.createElement("style");
  s.setAttribute("data-dtm", "lifecycle");
  s.textContent = CSS;
  document.head.appendChild(s);
}

const PATHS = {
  detected: "M8 1.5 14.5 13H1.5z M8 6v3.5 M8 11h.01",         // alert triangle
  fenced:   "M3 3h10v10H3z M3 6h10 M6 3v10",                  // fence/grid
  advised:  "M8 1.5a6.5 6.5 0 100 13 6.5 6.5 0 000-13 M8 5v3.5 M8 11h.01", // info
  reconciled:"M2.5 8.5 6 12l7.5-8",                            // check
  patched:  "M9.5 2.5 13.5 6.5 6 14H2.5v-3.5z",               // patch
};

function Icon({ stage }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <path d={PATHS[stage] || PATHS.detected} />
    </svg>
  );
}

const LABELS = { detected:"detected", fenced:"fenced", advised:"advised", reconciled:"reconciled", patched:"spec patched" };
const STAGE_VAR = { detected:"--amber", fenced:"--red", advised:"--blue", reconciled:"--green", patched:"--green" };

/**
 * datum LifecycleChip — one stage of a delta's lifecycle with its elapsed time.
 * Stages map to the signal palette: detected→amber, fenced→red, advised→blue,
 * reconciled/patched→green.
 */
export function LifecycleChip({ stage = "detected", elapsed = null, label = null, pending = false, done = false, className = "", ...rest }) {
  inject();
  // active (full color) only when neither completed nor future
  const active = !done && !pending;
  const cls = [
    "dtm-life",
    active ? `dtm-life--${stage}` : "",
    done ? "dtm-life--done" : "",
    pending ? "dtm-life--pending" : "",
    className,
  ].filter(Boolean).join(" ");
  return (
    <span className={cls} {...rest}>
      {done
        ? <span className="dtm-life__dot" style={{ background: `var(${STAGE_VAR[stage] || "--text-tertiary"})` }} />
        : <span className="dtm-life__icon"><Icon stage={stage} /></span>}
      <span>{label || LABELS[stage] || stage}</span>
      {elapsed && <span className="dtm-life__elapsed">{elapsed}</span>}
    </span>
  );
}
