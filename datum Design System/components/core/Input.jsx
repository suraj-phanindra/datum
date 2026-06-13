import React from "react";

const CSS = `
.dtm-field{ display:flex; flex-direction:column; gap:6px; }
.dtm-field__label{ font-size:12px; font-weight:var(--fw-medium); color:var(--text-secondary); }
.dtm-field__hint{ font-size:11px; color:var(--text-tertiary); }
.dtm-input{
  display:flex; align-items:center; gap:8px;
  height:32px; padding:0 10px; border-radius:var(--radius-sm);
  background:var(--bg-inset); border:1px solid var(--border-hairline);
  transition:border-color var(--dur-fast) var(--ease-out), box-shadow var(--dur-fast);
}
.dtm-input:focus-within{ border-color:var(--border-focus); box-shadow:var(--ring-focus); }
.dtm-input--invalid{ border-color:var(--signal-red-line); }
.dtm-input__prefix,.dtm-input__suffix{ color:var(--text-tertiary); display:inline-flex; align-items:center; flex:none; }
.dtm-input__prefix svg,.dtm-input__suffix svg{ width:13px; height:13px; display:block; }
.dtm-input input{
  flex:1; min-width:0; background:transparent; border:0; outline:none;
  color:var(--text-primary); font-family:var(--font-sans); font-size:13px;
  letter-spacing:var(--tracking-tight);
}
.dtm-input input::placeholder{ color:var(--text-tertiary); }
.dtm-input--mono input{ font-family:var(--font-mono); font-size:12px; }
`;

let injected = false;
function inject(){
  if (injected || typeof document === "undefined") return;
  injected = true;
  const s = document.createElement("style");
  s.setAttribute("data-dtm", "input");
  s.textContent = CSS;
  document.head.appendChild(s);
}

/**
 * datum Input — a single-line field. Use `mono` for any field that
 * holds an identifier (contract name, path, version, branch).
 */
export function Input({
  label = null,
  hint = null,
  prefix = null,
  suffix = null,
  mono = false,
  invalid = false,
  id,
  className = "",
  ...rest
}) {
  inject();
  const wrapCls = [
    "dtm-input",
    mono ? "dtm-input--mono" : "",
    invalid ? "dtm-input--invalid" : "",
    className,
  ].filter(Boolean).join(" ");
  const field = (
    <div className={wrapCls}>
      {prefix && <span className="dtm-input__prefix">{prefix}</span>}
      <input id={id} {...rest} />
      {suffix && <span className="dtm-input__suffix">{suffix}</span>}
    </div>
  );
  if (!label && !hint) return field;
  return (
    <label className="dtm-field" htmlFor={id}>
      {label && <span className="dtm-field__label">{label}</span>}
      {field}
      {hint && <span className="dtm-field__hint">{hint}</span>}
    </label>
  );
}
