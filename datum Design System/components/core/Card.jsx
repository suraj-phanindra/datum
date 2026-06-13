import React from "react";

const CSS = `
.dtm-card{
  background:var(--surface-card); border:1px solid var(--border-hairline);
  border-radius:var(--radius-md); color:var(--text-primary); overflow:hidden;
}
.dtm-card--inset{ background:var(--bg-inset); }
.dtm-card--interactive{ cursor:pointer; transition:border-color var(--dur-fast) var(--ease-out), background var(--dur-fast); }
.dtm-card--interactive:hover{ border-color:var(--border-strong); background:var(--surface-raised); }

/* severity tint = a hairline top rule in the signal hue (no left-border accent) */
.dtm-card--amber{ border-top:2px solid var(--amber); }
.dtm-card--red{ border-top:2px solid var(--red); }
.dtm-card--blue{ border-top:2px solid var(--blue); }
.dtm-card--green{ border-top:2px solid var(--green); }

.dtm-card__head{
  display:flex; align-items:center; gap:10px; padding:12px 14px;
  border-bottom:1px solid var(--border-hairline);
}
.dtm-card__eyebrow{
  font-family:var(--font-mono); font-size:10.5px; letter-spacing:.06em;
  text-transform:uppercase; color:var(--text-tertiary);
}
.dtm-card__title{ font-size:14px; font-weight:var(--fw-semibold); letter-spacing:var(--tracking-tight); }
.dtm-card__titles{ display:flex; flex-direction:column; gap:2px; min-width:0; }
.dtm-card__actions{ margin-left:auto; display:flex; align-items:center; gap:6px; }
.dtm-card__body{ padding:14px; }
.dtm-card__body--flush{ padding:0; }
`;

let injected = false;
function inject(){
  if (injected || typeof document === "undefined") return;
  injected = true;
  const s = document.createElement("style");
  s.setAttribute("data-dtm", "card");
  s.textContent = CSS;
  document.head.appendChild(s);
}

/**
 * datum Card — the surface panel. Hairline border, 7px radius, no shadow.
 * Severity is shown as a thin top rule in the signal hue, never a left accent.
 */
export function Card({
  title = null,
  eyebrow = null,
  actions = null,
  severity = null,
  inset = false,
  interactive = false,
  flush = false,
  className = "",
  children,
  ...rest
}) {
  inject();
  const cls = [
    "dtm-card",
    inset ? "dtm-card--inset" : "",
    interactive ? "dtm-card--interactive" : "",
    severity ? `dtm-card--${severity}` : "",
    className,
  ].filter(Boolean).join(" ");
  const hasHead = title || eyebrow || actions;
  return (
    <div className={cls} {...rest}>
      {hasHead && (
        <div className="dtm-card__head">
          <div className="dtm-card__titles">
            {eyebrow && <span className="dtm-card__eyebrow">{eyebrow}</span>}
            {title && <span className="dtm-card__title">{title}</span>}
          </div>
          {actions && <div className="dtm-card__actions">{actions}</div>}
        </div>
      )}
      <div className={flush ? "dtm-card__body dtm-card__body--flush" : "dtm-card__body"}>
        {children}
      </div>
    </div>
  );
}
