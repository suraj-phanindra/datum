import React from "react";

const CSS = `
.dtm-tag{
  display:inline-flex; align-items:center; gap:6px;
  font-family:var(--font-mono); font-size:12px; font-weight:var(--fw-regular);
  line-height:1; padding:3px 7px; border-radius:var(--radius-xs);
  background:var(--bg-inset); color:var(--text-primary);
  border:1px solid var(--border-hairline); white-space:nowrap;
  font-feature-settings:"tnum" 1;
}
.dtm-tag--sm{ font-size:11px; padding:2px 5px; }
.dtm-tag__icon{ color:var(--text-tertiary); display:inline-flex; }
.dtm-tag__icon svg{ width:11px; height:11px; display:block; }
.dtm-tag__ver{ color:var(--text-tertiary); }
.dtm-tag__ver--live{ color:var(--signal-amber); }
.dtm-tag--button{ cursor:pointer; transition:border-color var(--dur-fast), background var(--dur-fast); }
.dtm-tag--button:hover{ border-color:var(--border-focus); background:var(--surface-raised); }
`;

let injected = false;
function inject(){
  if (injected || typeof document === "undefined") return;
  injected = true;
  const s = document.createElement("style");
  s.setAttribute("data-dtm", "tag");
  s.textContent = CSS;
  document.head.appendChild(s);
}

/**
 * datum Tag — a monospace identifier token for contract names, paths,
 * branches and versions. Identifiers are always mono, never proportional.
 */
export function Tag({
  icon = null,
  version = null,
  live = false,
  size = "md",
  as = "span",
  className = "",
  children,
  ...rest
}) {
  inject();
  const interactive = as === "button" || !!rest.onClick;
  const cls = [
    "dtm-tag",
    size === "sm" ? "dtm-tag--sm" : "",
    interactive ? "dtm-tag--button" : "",
    className,
  ].filter(Boolean).join(" ");
  const Comp = as;
  return (
    <Comp className={cls} {...rest}>
      {icon && <span className="dtm-tag__icon">{icon}</span>}
      {children}
      {version && (
        <span className={live ? "dtm-tag__ver dtm-tag__ver--live" : "dtm-tag__ver"}>
          {version}
        </span>
      )}
    </Comp>
  );
}
