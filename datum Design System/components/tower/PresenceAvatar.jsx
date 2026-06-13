import React from "react";

const CSS = `
.dtm-av{ position:relative; display:inline-flex; align-items:center; justify-content:center;
  background:var(--surface-raised); color:var(--text-secondary);
  border:1px solid var(--border-strong); border-radius:var(--radius-sm);
  font-family:var(--font-mono); font-weight:var(--fw-medium); text-transform:lowercase;
  letter-spacing:0; box-sizing:border-box; }
.dtm-av--sm{ width:20px; height:20px; font-size:9px; border-radius:4px; }
.dtm-av--md{ width:26px; height:26px; font-size:11px; }
.dtm-av--lg{ width:34px; height:34px; font-size:13px; border-radius:var(--radius-md); }
/* a session actively building against this surface */
.dtm-av--active{ border-color:var(--signal-amber-line); color:var(--text-primary); }
.dtm-av__pulse{ position:absolute; right:-2px; bottom:-2px; width:7px; height:7px; border-radius:50%;
  background:var(--amber); border:1.5px solid var(--bg-base); }
.dtm-av--ring{ box-shadow:0 0 0 2px var(--bg-base); }

.dtm-stack{ display:inline-flex; align-items:center; }
.dtm-stack > .dtm-av{ margin-left:-7px; box-shadow:0 0 0 2px var(--bg-base); }
.dtm-stack > .dtm-av:first-child{ margin-left:0; }
.dtm-stack__more{ margin-left:-7px; display:inline-flex; align-items:center; justify-content:center;
  height:26px; min-width:26px; padding:0 5px; border-radius:var(--radius-sm);
  background:var(--surface-card); border:1px solid var(--border-hairline); box-shadow:0 0 0 2px var(--bg-base);
  font-family:var(--font-mono); font-size:10px; color:var(--text-tertiary); }
`;

let injected = false;
function inject(){
  if (injected || typeof document === "undefined") return;
  injected = true;
  const s = document.createElement("style");
  s.setAttribute("data-dtm", "presence");
  s.textContent = CSS;
  document.head.appendChild(s);
}

/**
 * datum PresenceAvatar — a session shown as initials (human + agent as one
 * unit; never a robot avatar). `active` marks a session currently building
 * against the surface it is parked on.
 */
export function PresenceAvatar({ initials, name, size = "md", active = false, ring = false, className = "", ...rest }) {
  inject();
  const cls = ["dtm-av", `dtm-av--${size}`, active ? "dtm-av--active" : "", ring ? "dtm-av--ring" : "", className].filter(Boolean).join(" ");
  return (
    <span className={cls} title={name || initials} {...rest}>
      {initials}
      {active && <span className="dtm-av__pulse" />}
    </span>
  );
}

/**
 * Overlapping group of sessions parked on a contract or file (Figma-style).
 */
export function PresenceStack({ sessions = [], max = 4, size = "md", className = "", ...rest }) {
  inject();
  const shown = sessions.slice(0, max);
  const extra = sessions.length - shown.length;
  return (
    <span className={["dtm-stack", className].filter(Boolean).join(" ")} {...rest}>
      {shown.map((s, i) => (
        <PresenceAvatar key={s.initials + i} initials={s.initials} name={s.name} active={s.active} size={size} />
      ))}
      {extra > 0 && <span className="dtm-stack__more">+{extra}</span>}
    </span>
  );
}
