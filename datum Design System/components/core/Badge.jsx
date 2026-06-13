import React from "react";

const CSS = `
.dtm-badge{
  display:inline-flex; align-items:center; gap:6px;
  font-family:var(--font-mono); font-size:11px; font-weight:var(--fw-medium);
  line-height:1; padding:4px 8px; border-radius:var(--radius-xs);
  border:1px solid transparent; white-space:nowrap;
}
.dtm-badge--sm{ font-size:10.5px; padding:3px 6px; gap:5px; }
.dtm-badge__dot{ width:6px; height:6px; border-radius:50%; flex:none; }

.dtm-badge--neutral{ background:var(--surface-raised); color:var(--text-secondary); border-color:var(--border-hairline); }
.dtm-badge--neutral .dtm-badge__dot{ background:var(--text-tertiary); }

.dtm-badge--amber{ background:var(--signal-amber-tint); color:var(--signal-amber); border-color:var(--signal-amber-line); }
.dtm-badge--amber .dtm-badge__dot{ background:var(--amber); }
.dtm-badge--red{ background:var(--signal-red-tint); color:var(--signal-red); border-color:var(--signal-red-line); }
.dtm-badge--red .dtm-badge__dot{ background:var(--red); }
.dtm-badge--blue{ background:var(--signal-blue-tint); color:var(--signal-blue); border-color:var(--signal-blue-line); }
.dtm-badge--blue .dtm-badge__dot{ background:var(--blue); }
.dtm-badge--green{ background:var(--signal-green-tint); color:var(--signal-green); border-color:var(--signal-green-line); }
.dtm-badge--green .dtm-badge__dot{ background:var(--green); }

.dtm-badge--solid.dtm-badge--amber{ background:var(--amber); color:var(--text-on-accent); border-color:transparent; }
.dtm-badge--solid.dtm-badge--red{ background:var(--red); color:#fff; border-color:transparent; }
.dtm-badge--solid.dtm-badge--blue{ background:var(--blue); color:#fff; border-color:transparent; }
.dtm-badge--solid.dtm-badge--green{ background:var(--green); color:#fff; border-color:transparent; }
.dtm-badge--solid .dtm-badge__dot{ background:currentColor; opacity:.85; }

.dtm-badge--live .dtm-badge__dot{ animation:dtm-pulse 1.8s var(--ease-in-out) infinite; }
@keyframes dtm-pulse{ 0%,100%{opacity:1} 50%{opacity:.35} }
@media (prefers-reduced-motion:reduce){ .dtm-badge--live .dtm-badge__dot{ animation:none; } }
`;

let injected = false;
function inject(){
  if (injected || typeof document === "undefined") return;
  injected = true;
  const s = document.createElement("style");
  s.setAttribute("data-dtm", "badge");
  s.textContent = CSS;
  document.head.appendChild(s);
}

/**
 * datum Badge — a status pill whose hue is strictly semantic:
 * amber=contract/epoch, red=break/fence, blue=advisory, green=reconciled.
 * Ambient states stay neutral.
 */
export function Badge({
  signal = "neutral",
  variant = "soft",
  size = "md",
  dot = false,
  live = false,
  className = "",
  children,
  ...rest
}) {
  inject();
  const cls = [
    "dtm-badge",
    `dtm-badge--${signal}`,
    variant === "solid" ? "dtm-badge--solid" : "",
    size === "sm" ? "dtm-badge--sm" : "",
    live ? "dtm-badge--live" : "",
    className,
  ].filter(Boolean).join(" ");
  return (
    <span className={cls} {...rest}>
      {(dot || live) && <span className="dtm-badge__dot" />}
      {children}
    </span>
  );
}
