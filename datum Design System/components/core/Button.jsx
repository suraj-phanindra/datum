import React from "react";

const CSS = `
.dtm-btn{
  display:inline-flex; align-items:center; justify-content:center; gap:7px;
  font-family:var(--font-sans); font-weight:var(--fw-medium); letter-spacing:var(--tracking-tight);
  border-radius:var(--radius-md); border:1px solid transparent; cursor:pointer;
  white-space:nowrap; user-select:none; transition:background var(--dur-fast) var(--ease-out),
  border-color var(--dur-fast) var(--ease-out), color var(--dur-fast) var(--ease-out), opacity var(--dur-fast);
}
.dtm-btn:focus-visible{ outline:none; box-shadow:var(--ring-focus); }
.dtm-btn[disabled]{ cursor:not-allowed; opacity:.45; }
.dtm-btn svg{ width:1em; height:1em; flex:none; }

.dtm-btn--md{ height:32px; padding:0 13px; font-size:13px; }
.dtm-btn--sm{ height:26px; padding:0 10px; font-size:12px; border-radius:var(--radius-sm); }
.dtm-btn--lg{ height:38px; padding:0 18px; font-size:14px; }
.dtm-btn--icon.dtm-btn--md{ width:32px; padding:0; }
.dtm-btn--icon.dtm-btn--sm{ width:26px; padding:0; }

/* primary = high-contrast neutral (amber is reserved for contract state, never chrome) */
.dtm-btn--primary{ background:var(--text-primary); color:var(--bg-base); border-color:var(--text-primary); }
.dtm-btn--primary:hover:not([disabled]){ background:color-mix(in srgb,var(--text-primary) 88%, var(--bg-base)); }
.dtm-btn--primary:active:not([disabled]){ background:color-mix(in srgb,var(--text-primary) 78%, var(--bg-base)); }

.dtm-btn--secondary{ background:var(--surface-raised); color:var(--text-primary); border-color:var(--border-strong); }
.dtm-btn--secondary:hover:not([disabled]){ background:color-mix(in srgb,var(--surface-raised) 60%, var(--text-primary) 6%); border-color:var(--border-focus); }
.dtm-btn--secondary:active:not([disabled]){ background:var(--surface-card); }

.dtm-btn--ghost{ background:transparent; color:var(--text-secondary); border-color:transparent; }
.dtm-btn--ghost:hover:not([disabled]){ background:var(--surface-raised); color:var(--text-primary); }
.dtm-btn--ghost:active:not([disabled]){ background:var(--surface-card); }

/* danger = a fence / reject action — the one chrome use of red, on true blocking */
.dtm-btn--danger{ background:var(--signal-red-tint); color:var(--signal-red); border-color:var(--signal-red-line); }
.dtm-btn--danger:hover:not([disabled]){ background:color-mix(in srgb,var(--red) 24%, transparent); }
.dtm-btn--danger:active:not([disabled]){ background:color-mix(in srgb,var(--red) 30%, transparent); }
`;

let injected = false;
function inject(){
  if (injected || typeof document === "undefined") return;
  injected = true;
  const s = document.createElement("style");
  s.setAttribute("data-dtm", "button");
  s.textContent = CSS;
  document.head.appendChild(s);
}

/**
 * datum Button — actions across the tower. Amber is never used for chrome,
 * so "primary" is a high-contrast neutral; "danger" is the fence/reject red.
 */
export function Button({
  variant = "secondary",
  size = "md",
  iconOnly = false,
  leadingIcon = null,
  trailingIcon = null,
  disabled = false,
  type = "button",
  className = "",
  children,
  ...rest
}) {
  inject();
  const cls = [
    "dtm-btn",
    `dtm-btn--${variant}`,
    `dtm-btn--${size}`,
    iconOnly ? "dtm-btn--icon" : "",
    className,
  ].filter(Boolean).join(" ");
  return (
    <button type={type} className={cls} disabled={disabled} {...rest}>
      {leadingIcon}
      {!iconOnly && children}
      {iconOnly && children}
      {trailingIcon}
    </button>
  );
}
