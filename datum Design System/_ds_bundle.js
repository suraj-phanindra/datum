/* @ds-bundle: {"format":3,"namespace":"DatumDesignSystem_b409bf","components":[{"name":"Badge","sourcePath":"components/core/Badge.jsx"},{"name":"Button","sourcePath":"components/core/Button.jsx"},{"name":"Card","sourcePath":"components/core/Card.jsx"},{"name":"Input","sourcePath":"components/core/Input.jsx"},{"name":"Tag","sourcePath":"components/core/Tag.jsx"},{"name":"BlastRadius","sourcePath":"components/drift/BlastRadius.jsx"},{"name":"DriftCard","sourcePath":"components/drift/DriftCard.jsx"},{"name":"LiveDriftCard","sourcePath":"components/drift/LiveDriftCard.jsx"},{"name":"ContractRow","sourcePath":"components/tower/ContractRow.jsx"},{"name":"EpochStrip","sourcePath":"components/tower/EpochStrip.jsx"},{"name":"LedgerEntry","sourcePath":"components/tower/LedgerEntry.jsx"},{"name":"LifecycleChip","sourcePath":"components/tower/LifecycleChip.jsx"},{"name":"PresenceAvatar","sourcePath":"components/tower/PresenceAvatar.jsx"},{"name":"PresenceStack","sourcePath":"components/tower/PresenceAvatar.jsx"}],"sourceHashes":{"components/core/Badge.jsx":"b6147dafe308","components/core/Button.jsx":"b43252193b9c","components/core/Card.jsx":"50d2216e6dd2","components/core/Input.jsx":"cb9f0fb30925","components/core/Tag.jsx":"74324132ea1d","components/drift/BlastRadius.jsx":"4209c1ca5cc0","components/drift/DriftCard.jsx":"63aaac2920b7","components/drift/LiveDriftCard.jsx":"c4899cc0f037","components/tower/ContractRow.jsx":"bb3f9df8b34d","components/tower/EpochStrip.jsx":"abbc55693430","components/tower/LedgerEntry.jsx":"7985f98dbf24","components/tower/LifecycleChip.jsx":"4889577a92e9","components/tower/PresenceAvatar.jsx":"90e97e760959","ui_kits/tower/Chrome.jsx":"a1a8a547ee8a","ui_kits/tower/ExtraScreens.jsx":"6c7a5c1a0935","ui_kits/tower/FleetFooter.jsx":"583fd8666bc2","ui_kits/tower/RegistryScreen.jsx":"de9206122e0d","ui_kits/tower/TowerApp.jsx":"89439d16e3e9","ui_kits/tower/TowerHome.jsx":"88d78397f585","ui_kits/tower/data.js":"87fb953002dd"},"inlinedExternals":[],"unexposedExports":[]} */

(() => {

const __ds_ns = (window.DatumDesignSystem_b409bf = window.DatumDesignSystem_b409bf || {});

const __ds_scope = {};

(__ds_ns.__errors = __ds_ns.__errors || []);

// components/core/Badge.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
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
function inject() {
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
function Badge({
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
  const cls = ["dtm-badge", `dtm-badge--${signal}`, variant === "solid" ? "dtm-badge--solid" : "", size === "sm" ? "dtm-badge--sm" : "", live ? "dtm-badge--live" : "", className].filter(Boolean).join(" ");
  return /*#__PURE__*/React.createElement("span", _extends({
    className: cls
  }, rest), (dot || live) && /*#__PURE__*/React.createElement("span", {
    className: "dtm-badge__dot"
  }), children);
}
Object.assign(__ds_scope, { Badge });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Badge.jsx", error: String((e && e.message) || e) }); }

// components/core/Button.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
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
function inject() {
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
function Button({
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
  const cls = ["dtm-btn", `dtm-btn--${variant}`, `dtm-btn--${size}`, iconOnly ? "dtm-btn--icon" : "", className].filter(Boolean).join(" ");
  return /*#__PURE__*/React.createElement("button", _extends({
    type: type,
    className: cls,
    disabled: disabled
  }, rest), leadingIcon, !iconOnly && children, iconOnly && children, trailingIcon);
}
Object.assign(__ds_scope, { Button });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Button.jsx", error: String((e && e.message) || e) }); }

// components/core/Card.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
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
function inject() {
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
function Card({
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
  const cls = ["dtm-card", inset ? "dtm-card--inset" : "", interactive ? "dtm-card--interactive" : "", severity ? `dtm-card--${severity}` : "", className].filter(Boolean).join(" ");
  const hasHead = title || eyebrow || actions;
  return /*#__PURE__*/React.createElement("div", _extends({
    className: cls
  }, rest), hasHead && /*#__PURE__*/React.createElement("div", {
    className: "dtm-card__head"
  }, /*#__PURE__*/React.createElement("div", {
    className: "dtm-card__titles"
  }, eyebrow && /*#__PURE__*/React.createElement("span", {
    className: "dtm-card__eyebrow"
  }, eyebrow), title && /*#__PURE__*/React.createElement("span", {
    className: "dtm-card__title"
  }, title)), actions && /*#__PURE__*/React.createElement("div", {
    className: "dtm-card__actions"
  }, actions)), /*#__PURE__*/React.createElement("div", {
    className: flush ? "dtm-card__body dtm-card__body--flush" : "dtm-card__body"
  }, children));
}
Object.assign(__ds_scope, { Card });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Card.jsx", error: String((e && e.message) || e) }); }

// components/core/Input.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
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
function inject() {
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
function Input({
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
  const wrapCls = ["dtm-input", mono ? "dtm-input--mono" : "", invalid ? "dtm-input--invalid" : "", className].filter(Boolean).join(" ");
  const field = /*#__PURE__*/React.createElement("div", {
    className: wrapCls
  }, prefix && /*#__PURE__*/React.createElement("span", {
    className: "dtm-input__prefix"
  }, prefix), /*#__PURE__*/React.createElement("input", _extends({
    id: id
  }, rest)), suffix && /*#__PURE__*/React.createElement("span", {
    className: "dtm-input__suffix"
  }, suffix));
  if (!label && !hint) return field;
  return /*#__PURE__*/React.createElement("label", {
    className: "dtm-field",
    htmlFor: id
  }, label && /*#__PURE__*/React.createElement("span", {
    className: "dtm-field__label"
  }, label), field, hint && /*#__PURE__*/React.createElement("span", {
    className: "dtm-field__hint"
  }, hint));
}
Object.assign(__ds_scope, { Input });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Input.jsx", error: String((e && e.message) || e) }); }

// components/core/Tag.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
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
function inject() {
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
function Tag({
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
  const cls = ["dtm-tag", size === "sm" ? "dtm-tag--sm" : "", interactive ? "dtm-tag--button" : "", className].filter(Boolean).join(" ");
  const Comp = as;
  return /*#__PURE__*/React.createElement(Comp, _extends({
    className: cls
  }, rest), icon && /*#__PURE__*/React.createElement("span", {
    className: "dtm-tag__icon"
  }, icon), children, version && /*#__PURE__*/React.createElement("span", {
    className: live ? "dtm-tag__ver dtm-tag__ver--live" : "dtm-tag__ver"
  }, version));
}
Object.assign(__ds_scope, { Tag });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Tag.jsx", error: String((e && e.message) || e) }); }

// components/drift/BlastRadius.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const STATUS_VAR = {
  fenced: "--red",
  advised: "--blue",
  reconciled: "--green",
  pending: "--text-tertiary"
};
const STATUS_GLYPH = {
  fenced: "fenced",
  advised: "advised",
  reconciled: "reconciled",
  pending: "pending"
};

/**
 * datum BlastRadius — the product's signature graphic. The delta sits at the
 * center (amber); the affected sessions/files sit close on either side so the
 * two connectors are the dominant shape. Each node carries its lifecycle hue.
 * No survey rings — the connecting lines are the figure.
 */
function BlastRadius({
  delta = "v8",
  nodes = [],
  width = 360,
  height = 132,
  className = "",
  ...rest
}) {
  const cx = width * 0.30;
  const cy = height / 2;
  const n = Math.max(nodes.length, 1);

  // tight fan to the right: short radius, narrow vertical spread so the
  // connectors read as one chevron rather than a sunburst.
  const R = 86;
  const span = n === 1 ? 0 : Math.min(46, 22 + n * 8); // total degrees
  const start = -span / 2;
  const step = n > 1 ? span / (n - 1) : 0;
  const placed = nodes.map((nd, i) => {
    const deg = n === 1 ? 0 : start + i * step;
    const rad = deg * Math.PI / 180;
    return {
      ...nd,
      x: cx + Math.cos(rad) * R,
      y: cy + Math.sin(rad) * R
    };
  });
  return /*#__PURE__*/React.createElement("svg", _extends({
    className: ["dtm-blast", className].filter(Boolean).join(" "),
    width: "100%",
    viewBox: `0 0 ${width} ${height}`,
    preserveAspectRatio: "xMidYMid meet",
    fill: "none",
    xmlns: "http://www.w3.org/2000/svg"
  }, rest), placed.map((p, i) => /*#__PURE__*/React.createElement("line", {
    key: "l" + i,
    x1: cx,
    y1: cy,
    x2: p.x,
    y2: p.y,
    stroke: `var(${STATUS_VAR[p.status] || "--border-strong"})`,
    strokeWidth: "2",
    opacity: "0.7"
  })), /*#__PURE__*/React.createElement("circle", {
    cx: cx,
    cy: cy,
    r: "19",
    fill: "var(--signal-amber-tint)",
    stroke: "var(--signal-amber-line)",
    strokeWidth: "1.5"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: cx,
    cy: cy,
    r: "7",
    fill: "var(--amber)"
  }, /*#__PURE__*/React.createElement("animate", {
    attributeName: "opacity",
    values: "1;0.55;1",
    dur: "2s",
    repeatCount: "indefinite"
  })), /*#__PURE__*/React.createElement("text", {
    x: cx,
    y: cy - 28,
    textAnchor: "middle",
    fontFamily: "var(--font-mono)",
    fontSize: "15",
    fill: "var(--signal-amber)",
    fontWeight: "600"
  }, delta), placed.map((p, i) => {
    const col = `var(${STATUS_VAR[p.status] || "--text-tertiary"})`;
    return /*#__PURE__*/React.createElement("g", {
      key: "n" + i
    }, /*#__PURE__*/React.createElement("circle", {
      cx: p.x,
      cy: p.y,
      r: "17",
      fill: "var(--surface-raised)",
      stroke: col,
      strokeWidth: "2"
    }), /*#__PURE__*/React.createElement("text", {
      x: p.x,
      y: p.y + 4.5,
      textAnchor: "middle",
      fontFamily: "var(--font-mono)",
      fontSize: "13",
      fill: "var(--text-primary)"
    }, p.initials), /*#__PURE__*/React.createElement("text", {
      x: p.x + 24,
      y: p.y - 2,
      textAnchor: "start",
      fontFamily: "var(--font-mono)",
      fontSize: "13",
      fontWeight: "500",
      fill: "var(--text-primary)"
    }, p.label), /*#__PURE__*/React.createElement("text", {
      x: p.x + 24,
      y: p.y + 14,
      textAnchor: "start",
      fontFamily: "var(--font-mono)",
      fontSize: "12",
      fill: col
    }, STATUS_GLYPH[p.status] || p.status));
  }));
}
Object.assign(__ds_scope, { BlastRadius });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/drift/BlastRadius.jsx", error: String((e && e.message) || e) }); }

// components/drift/LiveDriftCard.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/* ============================================================
   datum · LiveDriftCard
   The drift card as an explicit state machine. One render path,
   two event sources: a scripted emitter (replay/video) and the
   imperative emit() (live bus). Motion only ever responds to an
   event — nothing here is on a decorative clock.
   States: calm → detected → fenced → advised → reconciling
           → reconciled → patched
   ============================================================ */

const CSS = `
.dtm-live{ position:relative; }
.dtm-live__feed{ display:flex; align-items:center; justify-content:space-between;
  padding:11px 14px; border:1px solid var(--border-hairline); border-radius:var(--radius-md);
  background:var(--surface-card); font-family:var(--font-mono); font-size:12.5px; }
.dtm-live__feed .nm{ display:flex; align-items:center; gap:9px; color:var(--text-primary); }
.dtm-live__feed .dot{ width:7px; height:7px; border-radius:50%; background:var(--text-tertiary);
  transition:background var(--dur-base) var(--ease-out); }
.dtm-live__feed .dot[data-on="green"]{ background:var(--green); }
.dtm-live__feed .meta{ font-size:11px; color:var(--text-tertiary); }

.dtm-live__card{ position:relative; overflow:hidden; border:1px solid var(--border-hairline);
  border-radius:var(--radius-md); background:var(--surface-card);
  max-height:0; opacity:0; margin-top:0;
  transition:max-height .42s cubic-bezier(.16,1,.3,1), opacity .42s cubic-bezier(.16,1,.3,1), margin-top .42s; }
.dtm-live__card[data-open="true"]{ max-height:640px; opacity:1; margin-top:12px; }

/* the single left-edge ripple — retriggered by key, never looped */
.dtm-live__ripple{ position:absolute; left:-1px; top:50%; width:18px; height:18px; border-radius:50%;
  border:1.5px solid var(--amber); transform:translate(-50%,-50%) scale(.3); opacity:0; pointer-events:none; z-index:4; }
.dtm-live__ripple[data-fire="true"]{ animation:dtm-ripple .64s var(--ease-out) 1; }
@keyframes dtm-ripple{ 0%{transform:translate(-50%,-50%) scale(.3);opacity:.5} 100%{transform:translate(-50%,-50%) scale(5);opacity:0} }

.dtm-live__head{ display:flex; align-items:center; justify-content:space-between; padding:11px 16px;
  background:var(--surface-raised); transition:background .3s var(--ease-out); }
.dtm-live__head[data-tint="amber"]{ background:var(--signal-amber-tint); }
.dtm-live__head[data-tint="red"]{ background:var(--signal-red-tint); }
.dtm-live__head[data-tint="neutral"]{ background:var(--surface-raised); }
.dtm-live__head[data-tint="green"]{ background:var(--signal-green-tint); }
.dtm-live__title{ display:flex; align-items:center; gap:8px; font-family:var(--font-mono); font-size:13.5px;
  color:var(--text-primary); transition:color .3s; }
.dtm-live__title .to{ color:var(--signal-amber); }
.dtm-live__title svg{ width:14px; height:14px; flex:none; }
.dtm-live__head[data-tint="amber"] .dtm-live__title{ color:var(--signal-amber); }
.dtm-live__head[data-tint="red"] .dtm-live__title{ color:var(--signal-red); }
.dtm-live__head[data-tint="green"] .dtm-live__title{ color:var(--signal-green); }
.dtm-live__time{ font-family:var(--font-mono); font-size:11px; color:var(--text-tertiary); }

.dtm-live__body{ padding:13px 16px; }

.dtm-live__chips{ display:flex; gap:6px; flex-wrap:wrap; margin-bottom:13px; }
.dtm-live__chip{ display:inline-flex; align-items:center; gap:6px; height:24px; padding:0 9px;
  border-radius:var(--radius-xs); font-family:var(--font-mono); font-size:11px;
  border:1px solid var(--border-hairline); color:var(--text-tertiary); background:transparent;
  transition:all .24s var(--ease-out); white-space:nowrap; }
.dtm-live__chip svg{ width:11px; height:11px; flex:none; }
.dtm-live__chip[data-s="ghost"]{ opacity:.42; border-style:dashed; }
.dtm-live__chip[data-s="complete"]{ color:var(--text-tertiary); border-color:var(--border-hairline); background:var(--surface-card); }
.dtm-live__chip[data-s="complete"] .ic{ display:none; }
.dtm-live__chip .cdot{ width:6px; height:6px; border-radius:50%; flex:none; display:none; }
.dtm-live__chip[data-s="complete"] .cdot{ display:inline-block; }
.dtm-live__chip[data-s="active"][data-c="amber"]{ color:var(--signal-amber); border-color:var(--signal-amber-line); background:var(--signal-amber-tint); }
.dtm-live__chip[data-s="active"][data-c="red"]{ color:var(--signal-red); border-color:var(--signal-red-line); background:var(--signal-red-tint); }
.dtm-live__chip[data-s="active"][data-c="blue"]{ color:var(--signal-blue); border-color:var(--signal-blue-line); background:var(--signal-blue-tint); }
.dtm-live__chip[data-s="active"][data-c="green"]{ color:var(--signal-green); border-color:var(--signal-green-line); background:var(--signal-green-tint); }

.dtm-live__why{ font-size:13px; color:var(--text-secondary); line-height:1.5; margin:0 0 11px; }
.dtm-live__why .who{ color:var(--text-tertiary); }
.dtm-live__change{ display:inline-flex; align-items:center; gap:8px; margin-top:9px;
  font-family:var(--font-mono); font-size:12.5px; background:var(--bg-inset);
  border:1px solid var(--border-hairline); border-radius:var(--radius-sm); padding:6px 10px; }
.dtm-live__strike{ position:relative; color:var(--text-primary); transition:color .25s; }
.dtm-live__strike::after{ content:""; position:absolute; left:0; top:50%; height:1px; width:0;
  background:currentColor; transition:width .2s var(--ease-out); }
.dtm-live__strike[data-struck="true"]{ color:var(--text-tertiary); }
.dtm-live__strike[data-struck="true"]::after{ width:100%; }
.dtm-live__change .arr{ color:var(--text-tertiary); }
.dtm-live__change .new{ color:var(--text-primary); }
.dtm-live__change .mig{ color:var(--text-tertiary); }

.dtm-live__radius{ margin-top:4px; }
.dtm-live__foot{ max-height:0; opacity:0; overflow:hidden; margin-top:0;
  transition:max-height .3s var(--ease-out), opacity .3s, margin-top .3s; }
.dtm-live__foot[data-open="true"]{ max-height:60px; opacity:1; margin-top:12px; }
.dtm-live__foot-in{ display:flex; align-items:center; gap:14px; padding-top:11px;
  border-top:1px solid var(--border-hairline); font-family:var(--font-mono); font-size:12px; }
.dtm-live__link{ display:inline-flex; align-items:center; gap:6px; color:var(--signal-blue); cursor:pointer; }
.dtm-live__link svg{ width:12px; height:12px; }
.dtm-live__link .gd{ color:var(--signal-green); }

@media (prefers-reduced-motion: reduce){
  .dtm-live__card, .dtm-live__head, .dtm-live__chip, .dtm-live__strike, .dtm-live__strike::after,
  .dtm-live__foot, .dtm-live__feed .dot{ transition:opacity .12s linear !important; }
  .dtm-live__ripple{ display:none !important; }
}
`;
let injected = false;
function inject() {
  if (injected || typeof document === "undefined") return;
  injected = true;
  const s = document.createElement("style");
  s.setAttribute("data-dtm", "livedrift");
  s.textContent = CSS;
  document.head.appendChild(s);
}
const Ic = {
  detected: /*#__PURE__*/React.createElement("path", {
    d: "M8 1.8 14.4 13H1.6z M8 6.2v3.4 M8 11h.01"
  }),
  fenced: /*#__PURE__*/React.createElement("path", {
    d: "M3 3h10v10H3z M3 6.5h10 M6.2 3v10"
  }),
  advised: /*#__PURE__*/React.createElement("path", {
    d: "M8 1.8a6.2 6.2 0 100 12.4 6.2 6.2 0 000-12.4 M8 5.2v3.4 M8 11h.01"
  }),
  reconciled: /*#__PURE__*/React.createElement("path", {
    d: "M2.5 8.4 6 11.8l7.5-7.6"
  }),
  pr: /*#__PURE__*/React.createElement("g", null, /*#__PURE__*/React.createElement("circle", {
    cx: "4",
    cy: "4",
    r: "2"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "4",
    cy: "12",
    r: "2"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "12",
    cy: "12",
    r: "2"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M4 6v4M12 10V8a2 2 0 00-2-2H7",
    strokeLinecap: "round"
  }))
};
function ChipIcon({
  k
}) {
  return /*#__PURE__*/React.createElement("svg", {
    viewBox: "0 0 16 16",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "1.4",
    strokeLinecap: "round",
    strokeLinejoin: "round",
    className: "ic"
  }, Ic[k] || Ic.detected);
}
const STAGES = ["calm", "detected", "fenced", "advised", "reconciling", "reconciled", "patched"];
const HEX = {
  amber: "var(--amber)",
  red: "var(--red)",
  blue: "var(--blue)",
  green: "var(--green)"
};

// chip lifecycle resolved from the current stage
function chipState(idxOf, stage, chipName) {
  const cur = idxOf(stage);
  if (chipName === "reconcile") {
    if (cur < idxOf("reconciling")) return "ghost";
    if (stage === "reconciling" || stage === "reconciled") return "active";
    return "complete"; // patched
  }
  if (chipName === "pr") return stage === "patched" ? "active" : "ghost";
  const map = {
    detected: "detected",
    fenced: "fenced",
    advised: "advised"
  };
  const own = idxOf(map[chipName]);
  if (cur < own) return "ghost";
  if (cur === own) return "active";
  return "complete";
}

// header tint per the spec's escalate→de-escalate→settle arc
const TINT = {
  calm: "neutral",
  detected: "amber",
  fenced: "red",
  advised: "neutral",
  reconciling: "neutral",
  reconciled: "green",
  patched: "green"
};
const LiveDriftCard = React.forwardRef(function LiveDriftCard({
  contract = "db.users",
  fromVersion = "v7",
  toVersion = "v8",
  timestamp = "14:02:11",
  quote = {
    who: "asha",
    text: "phone signups make email the wrong name."
  },
  change = {
    from: "users.email",
    to: "contact_email",
    migration: "migration 0042"
  },
  nodes = [{
    initials: "be",
    who: "ben",
    label: "routes/users.ts"
  }, {
    initials: "ch",
    who: "chen",
    label: "UserCard.tsx"
  }],
  pr = {
    label: "spec PR #14"
  },
  ledger = {
    label: "ledger #112"
  },
  autoPlay = false,
  loop = false,
  onStageChange = null,
  className = "",
  ...rest
}, ref) {
  inject();
  const [stage, setStage] = React.useState("calm");
  const [recCount, setRecCount] = React.useState(0);
  const [ben, setBen] = React.useState("neutral"); // neutral | fenced | reconciled
  const [chen, setChen] = React.useState("neutral"); // neutral | advised | reconciled
  const [rippleKey, setRippleKey] = React.useState(0);
  const [punch, setPunch] = React.useState(null); // "center" | "ben" | "settle"
  const timers = React.useRef([]);
  const idxOf = React.useCallback(s => STAGES.indexOf(s), []);
  React.useEffect(() => {
    if (onStageChange) onStageChange(stage);
  }, [stage, onStageChange]);
  const clearTimers = React.useCallback(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  }, []);
  const at = React.useCallback((ms, fn) => {
    timers.current.push(setTimeout(fn, ms));
  }, []);
  const reset = React.useCallback(() => {
    clearTimers();
    setStage("calm");
    setRecCount(0);
    setBen("neutral");
    setChen("neutral");
    setPunch(null);
  }, [clearTimers]);

  // one apply() for every event — the single source of state transition
  const emit = React.useCallback(event => {
    switch (event) {
      case "delta.detected":
        setStage("detected");
        setRippleKey(k => k + 1);
        setPunch("center");
        setTimeout(() => setPunch(null), 520);
        break;
      case "write.fenced":
        setStage("fenced");
        setBen("fenced");
        setPunch("ben");
        setTimeout(() => setPunch(p => p === "ben" ? null : p), 220);
        break;
      case "advisory.delivered":
        setStage("advised");
        setChen("advised");
        break;
      case "reconcile.ben":
        setStage("reconciling");
        setBen("reconciled");
        setRecCount(1);
        break;
      case "reconcile.chen":
        setChen("reconciled");
        setRecCount(2);
        setStage("reconciled");
        setPunch("settle");
        setTimeout(() => setPunch(null), 540);
        break;
      case "spec.pr.opened":
        setStage("patched");
        break;
      case "reset":
        reset();
        break;
      default:
        break;
    }
  }, [reset]);

  // scripted emitter — compressed ~8s timeline. Elapsed labels stay the REAL
  // numbers; only wall-clock pacing is compressed (honest time-lapse).
  const fire = React.useCallback(() => {
    clearTimers();
    reset();
    at(60, () => emit("delta.detected"));
    at(1200, () => emit("write.fenced"));
    at(2000, () => emit("advisory.delivered"));
    at(3500, () => emit("reconcile.ben"));
    at(4800, () => emit("reconcile.chen"));
    at(6200, () => emit("spec.pr.opened"));
    if (loop) at(9000, () => fire());
  }, [at, clearTimers, emit, reset, loop]);
  React.useImperativeHandle(ref, () => ({
    fire,
    reset,
    emit,
    getStage: () => stage
  }), [fire, reset, emit, stage]);
  React.useEffect(() => {
    if (autoPlay) {
      const t = setTimeout(fire, 500);
      return () => {
        clearTimeout(t);
        clearTimers();
      };
    }
    return () => clearTimers();
    // eslint-disable-next-line
  }, [autoPlay]);

  // always clear pending timers on unmount (ref-driven kit may unmount mid-arc)
  React.useEffect(() => () => clearTimers(), [clearTimers]);
  const open = stage !== "calm";
  const tint = TINT[stage];
  const benCol = ben === "fenced" ? "red" : ben === "reconciled" ? "green" : null;
  const chenCol = chen === "advised" ? "blue" : chen === "reconciled" ? "green" : null;
  const chips = [{
    name: "detected",
    label: "detected",
    elapsed: "0.3s",
    color: "amber",
    icon: "detected"
  }, {
    name: "fenced",
    label: "fenced",
    elapsed: "5.8s",
    color: "red",
    icon: "fenced"
  }, {
    name: "advised",
    label: "advised",
    elapsed: "6.4s",
    color: "blue",
    icon: "advised"
  }, {
    name: "reconcile",
    label: recCount >= 2 ? "reconciled" : "reconciling",
    elapsed: `${recCount}/2`,
    color: "green",
    icon: "reconciled"
  }, {
    name: "pr",
    label: pr ? pr.label : "spec PR",
    elapsed: "14:04",
    color: "blue",
    icon: "pr"
  }];
  return /*#__PURE__*/React.createElement("div", _extends({
    className: ["dtm-live", className].filter(Boolean).join(" ")
  }, rest), !open && /*#__PURE__*/React.createElement("div", {
    className: "dtm-live__feed"
  }, /*#__PURE__*/React.createElement("span", {
    className: "nm"
  }, /*#__PURE__*/React.createElement("span", {
    className: "dot",
    "data-on": stage === "calm" && recCount >= 2 ? "green" : "gray"
  }), contract), /*#__PURE__*/React.createElement("span", {
    className: "meta"
  }, "calm \xB7 synced to ", fromVersion)), /*#__PURE__*/React.createElement("div", {
    className: "dtm-live__card",
    "data-open": open
  }, /*#__PURE__*/React.createElement("span", {
    key: rippleKey,
    className: "dtm-live__ripple",
    "data-fire": rippleKey > 0
  }), /*#__PURE__*/React.createElement("div", {
    className: "dtm-live__head",
    "data-tint": tint
  }, /*#__PURE__*/React.createElement("span", {
    className: "dtm-live__title"
  }, /*#__PURE__*/React.createElement("svg", {
    viewBox: "0 0 16 16",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "1.4"
  }, /*#__PURE__*/React.createElement("circle", {
    cx: "8",
    cy: "8",
    r: "6.4"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "8",
    cy: "8",
    r: "1.8",
    fill: "currentColor",
    stroke: "none"
  })), "contract delta \xB7 ", contract, " ", fromVersion, " \u2192 ", /*#__PURE__*/React.createElement("span", {
    className: "to"
  }, toVersion)), /*#__PURE__*/React.createElement("span", {
    className: "dtm-live__time"
  }, timestamp)), /*#__PURE__*/React.createElement("div", {
    className: "dtm-live__body"
  }, /*#__PURE__*/React.createElement("div", {
    className: "dtm-live__chips"
  }, chips.map(c => {
    const s = chipState(idxOf, stage, c.name);
    const showElapsed = c.name === "pr" ? s === "active" : s !== "ghost";
    return /*#__PURE__*/React.createElement("span", {
      key: c.name,
      className: "dtm-live__chip",
      "data-s": s,
      "data-c": c.color
    }, /*#__PURE__*/React.createElement(ChipIcon, {
      k: c.icon
    }), /*#__PURE__*/React.createElement("span", {
      className: "cdot",
      style: {
        background: HEX[c.color]
      }
    }), /*#__PURE__*/React.createElement("span", null, c.label), showElapsed && /*#__PURE__*/React.createElement("span", {
      style: {
        color: "var(--text-tertiary)",
        fontFeatureSettings: '"tnum" 1'
      }
    }, c.elapsed));
  })), /*#__PURE__*/React.createElement("p", {
    className: "dtm-live__why"
  }, /*#__PURE__*/React.createElement("span", {
    className: "who"
  }, quote.who, ":"), " \"", quote.text, "\""), /*#__PURE__*/React.createElement("div", {
    className: "dtm-live__change"
  }, /*#__PURE__*/React.createElement("span", {
    className: "dtm-live__strike",
    "data-struck": idxOf(stage) >= idxOf("fenced")
  }, change.from), /*#__PURE__*/React.createElement("span", {
    className: "arr"
  }, "\u2192"), /*#__PURE__*/React.createElement("span", {
    className: "new"
  }, change.to), change.migration && /*#__PURE__*/React.createElement("span", {
    className: "mig"
  }, "\xB7 ", change.migration)), /*#__PURE__*/React.createElement("div", {
    className: "dtm-live__radius"
  }, /*#__PURE__*/React.createElement(BlastSVG, {
    delta: toVersion,
    open: open,
    punch: punch,
    nodes: [{
      ...nodes[0],
      col: benCol,
      status: ben === "fenced" ? "fenced" : ben === "reconciled" ? "reconciled" : "building"
    }, {
      ...nodes[1],
      col: chenCol,
      status: chen === "advised" ? "advised" : chen === "reconciled" ? "reconciled" : "building"
    }]
  })), /*#__PURE__*/React.createElement("div", {
    className: "dtm-live__foot",
    "data-open": stage === "patched"
  }, /*#__PURE__*/React.createElement("div", {
    className: "dtm-live__foot-in"
  }, pr && /*#__PURE__*/React.createElement("span", {
    className: "dtm-live__link"
  }, /*#__PURE__*/React.createElement("svg", {
    viewBox: "0 0 16 16",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "1.3"
  }, /*#__PURE__*/React.createElement("circle", {
    cx: "4",
    cy: "4",
    r: "2"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "4",
    cy: "12",
    r: "2"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "12",
    cy: "12",
    r: "2"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M4 6v4M12 10V8a2 2 0 00-2-2H7",
    strokeLinecap: "round"
  })), pr.label, " ", /*#__PURE__*/React.createElement("span", {
    className: "gd"
  }, "open")), ledger && /*#__PURE__*/React.createElement("span", {
    className: "dtm-live__link",
    style: {
      color: "var(--text-secondary)"
    }
  }, ledger.label))))));
});

/* the animated blast radius — node colors, line draw, fence punch, settle pulse.
   Geometry matches the static BlastRadius (tight fan, big labels, no rings). */
function BlastSVG({
  delta,
  nodes,
  punch,
  open
}) {
  const W = 380,
    H = 132;
  const cx = 70,
    cy = H / 2,
    R = 92;
  const pts = [{
    ...nodes[0],
    x: cx + R * Math.cos(-0.30),
    y: cy + R * Math.sin(-0.30)
  }, {
    ...nodes[1],
    x: cx + R * Math.cos(0.30),
    y: cy + R * Math.sin(0.30)
  }];
  const LABEL = {
    building: "building",
    fenced: "fenced",
    advised: "advised",
    reconciled: "reconciled"
  };
  return /*#__PURE__*/React.createElement("svg", {
    width: "100%",
    viewBox: `0 0 ${W} ${H}`,
    preserveAspectRatio: "xMidYMid meet",
    fill: "none",
    xmlns: "http://www.w3.org/2000/svg",
    role: "img",
    "aria-label": "blast radius"
  }, pts.map((p, i) => {
    const len = Math.hypot(p.x - cx, p.y - cy);
    const col = p.col ? HEX[p.col] : "var(--border-strong)";
    return /*#__PURE__*/React.createElement("line", {
      key: "l" + i,
      x1: cx,
      y1: cy,
      x2: p.x,
      y2: p.y,
      stroke: col,
      strokeWidth: "2",
      strokeDasharray: len,
      strokeDashoffset: open ? 0 : len,
      style: {
        transition: `stroke-dashoffset .32s ease-out ${i * 0.08}s, stroke .36s`
      }
    });
  }), punch === "settle" && /*#__PURE__*/React.createElement("circle", {
    cx: cx,
    cy: cy,
    r: "22",
    fill: "none",
    stroke: "var(--green)",
    strokeWidth: "1.5"
  }, /*#__PURE__*/React.createElement("animate", {
    attributeName: "r",
    from: "22",
    to: R + 30,
    dur: "0.52s",
    begin: "0s",
    fill: "freeze"
  }), /*#__PURE__*/React.createElement("animate", {
    attributeName: "opacity",
    from: "0.6",
    to: "0",
    dur: "0.52s",
    begin: "0s",
    fill: "freeze"
  })), /*#__PURE__*/React.createElement("circle", {
    cx: cx,
    cy: cy,
    r: "19",
    fill: "var(--signal-amber-tint)",
    stroke: "var(--signal-amber-line)",
    strokeWidth: "1.5",
    style: {
      transformBox: "fill-box",
      transformOrigin: "center",
      transform: punch === "center" ? "scale(1.16)" : "scale(1)",
      transition: "transform .5s var(--ease-out)"
    }
  }), /*#__PURE__*/React.createElement("circle", {
    cx: cx,
    cy: cy,
    r: "7",
    fill: "var(--amber)"
  }, open && /*#__PURE__*/React.createElement("animate", {
    attributeName: "opacity",
    values: "1;0.55;1",
    dur: "2s",
    repeatCount: "indefinite"
  })), /*#__PURE__*/React.createElement("text", {
    x: cx,
    y: cy - 28,
    textAnchor: "middle",
    fontFamily: "var(--font-mono)",
    fontSize: "15",
    fontWeight: "600",
    fill: "var(--signal-amber)"
  }, delta), pts.map((p, i) => {
    const col = p.col ? HEX[p.col] : "var(--text-tertiary)";
    const stroke = p.col ? HEX[p.col] : "var(--border-strong)";
    const punched = punch === "ben" && i === 0;
    return /*#__PURE__*/React.createElement("g", {
      key: "n" + i
    }, /*#__PURE__*/React.createElement("circle", {
      cx: p.x,
      cy: p.y,
      r: "17",
      fill: "var(--surface-raised)",
      stroke: stroke,
      strokeWidth: "2",
      style: {
        transformBox: "fill-box",
        transformOrigin: "center",
        transform: punched ? "scale(1.25)" : "scale(1)",
        transition: "transform .2s cubic-bezier(.34,1.56,.64,1), stroke .36s"
      }
    }), /*#__PURE__*/React.createElement("text", {
      x: p.x,
      y: p.y + 4.5,
      textAnchor: "middle",
      fontFamily: "var(--font-mono)",
      fontSize: "13",
      fill: "var(--text-primary)"
    }, p.initials), /*#__PURE__*/React.createElement("text", {
      x: p.x + 24,
      y: p.y - 2,
      textAnchor: "start",
      fontFamily: "var(--font-mono)",
      fontSize: "13",
      fontWeight: "500",
      fill: "var(--text-primary)"
    }, p.who, " \xB7 ", p.label), /*#__PURE__*/React.createElement("text", {
      x: p.x + 24,
      y: p.y + 14,
      textAnchor: "start",
      fontFamily: "var(--font-mono)",
      fontSize: "12",
      fill: col,
      style: {
        transition: "fill .36s"
      }
    }, LABEL[p.status] || p.status));
  }));
}
Object.assign(__ds_scope, { LiveDriftCard });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/drift/LiveDriftCard.jsx", error: String((e && e.message) || e) }); }

// components/tower/EpochStrip.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
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
function inject() {
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
function EpochStrip({
  versions = [],
  showTimes = false,
  animateLive = false,
  className = "",
  ...rest
}) {
  inject();
  return /*#__PURE__*/React.createElement("div", _extends({
    className: ["dtm-epoch", showTimes ? "dtm-epoch--times" : "", animateLive ? "dtm-epoch--tick" : "", className].filter(Boolean).join(" ")
  }, rest), versions.map((node, i) => {
    const live = node.state === "live";
    const past = node.state === "past" || !live && i < versions.length - 1;
    return /*#__PURE__*/React.createElement(React.Fragment, {
      key: node.v
    }, i > 0 && /*#__PURE__*/React.createElement("div", {
      className: "dtm-epoch__seg" + (versions[i].state === "live" ? " dtm-epoch__seg--live" : "")
    }), /*#__PURE__*/React.createElement("div", {
      className: "dtm-epoch__node"
    }, /*#__PURE__*/React.createElement("span", {
      className: "dtm-epoch__dot" + (live ? " dtm-epoch__dot--live" : past ? " dtm-epoch__dot--past" : "")
    }), /*#__PURE__*/React.createElement("span", {
      className: "dtm-epoch__v" + (live ? " dtm-epoch__v--live" : "")
    }, node.v), showTimes && node.time && /*#__PURE__*/React.createElement("span", {
      className: "dtm-epoch__t"
    }, node.time)));
  }));
}
Object.assign(__ds_scope, { EpochStrip });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/tower/EpochStrip.jsx", error: String((e && e.message) || e) }); }

// components/tower/LedgerEntry.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
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
function inject() {
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
function LedgerEntry({
  id,
  time,
  who,
  summary,
  head = false,
  interactive = true,
  onClick,
  className = "",
  ...rest
}) {
  inject();
  const cls = ["dtm-ledger", head ? "dtm-ledger--head" : "", interactive ? "dtm-ledger--interactive" : "", className].filter(Boolean).join(" ");
  return /*#__PURE__*/React.createElement("div", _extends({
    className: cls,
    onClick: onClick
  }, rest), id != null && /*#__PURE__*/React.createElement("span", {
    className: "dtm-ledger__id"
  }, "#", id), time && /*#__PURE__*/React.createElement("span", {
    className: "dtm-ledger__time"
  }, time), who && /*#__PURE__*/React.createElement("span", {
    className: "dtm-ledger__who"
  }, who), /*#__PURE__*/React.createElement("span", {
    className: "dtm-ledger__sep"
  }, "\xB7"), /*#__PURE__*/React.createElement("span", {
    className: "dtm-ledger__sum"
  }, summary));
}
Object.assign(__ds_scope, { LedgerEntry });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/tower/LedgerEntry.jsx", error: String((e && e.message) || e) }); }

// components/tower/LifecycleChip.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
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
function inject() {
  if (injected || typeof document === "undefined") return;
  injected = true;
  const s = document.createElement("style");
  s.setAttribute("data-dtm", "lifecycle");
  s.textContent = CSS;
  document.head.appendChild(s);
}
const PATHS = {
  detected: "M8 1.5 14.5 13H1.5z M8 6v3.5 M8 11h.01",
  // alert triangle
  fenced: "M3 3h10v10H3z M3 6h10 M6 3v10",
  // fence/grid
  advised: "M8 1.5a6.5 6.5 0 100 13 6.5 6.5 0 000-13 M8 5v3.5 M8 11h.01",
  // info
  reconciled: "M2.5 8.5 6 12l7.5-8",
  // check
  patched: "M9.5 2.5 13.5 6.5 6 14H2.5v-3.5z" // patch
};
function Icon({
  stage
}) {
  return /*#__PURE__*/React.createElement("svg", {
    viewBox: "0 0 16 16",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "1.4",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }, /*#__PURE__*/React.createElement("path", {
    d: PATHS[stage] || PATHS.detected
  }));
}
const LABELS = {
  detected: "detected",
  fenced: "fenced",
  advised: "advised",
  reconciled: "reconciled",
  patched: "spec patched"
};
const STAGE_VAR = {
  detected: "--amber",
  fenced: "--red",
  advised: "--blue",
  reconciled: "--green",
  patched: "--green"
};

/**
 * datum LifecycleChip — one stage of a delta's lifecycle with its elapsed time.
 * Stages map to the signal palette: detected→amber, fenced→red, advised→blue,
 * reconciled/patched→green.
 */
function LifecycleChip({
  stage = "detected",
  elapsed = null,
  label = null,
  pending = false,
  done = false,
  className = "",
  ...rest
}) {
  inject();
  // active (full color) only when neither completed nor future
  const active = !done && !pending;
  const cls = ["dtm-life", active ? `dtm-life--${stage}` : "", done ? "dtm-life--done" : "", pending ? "dtm-life--pending" : "", className].filter(Boolean).join(" ");
  return /*#__PURE__*/React.createElement("span", _extends({
    className: cls
  }, rest), done ? /*#__PURE__*/React.createElement("span", {
    className: "dtm-life__dot",
    style: {
      background: `var(${STAGE_VAR[stage] || "--text-tertiary"})`
    }
  }) : /*#__PURE__*/React.createElement("span", {
    className: "dtm-life__icon"
  }, /*#__PURE__*/React.createElement(Icon, {
    stage: stage
  })), /*#__PURE__*/React.createElement("span", null, label || LABELS[stage] || stage), elapsed && /*#__PURE__*/React.createElement("span", {
    className: "dtm-life__elapsed"
  }, elapsed));
}
Object.assign(__ds_scope, { LifecycleChip });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/tower/LifecycleChip.jsx", error: String((e && e.message) || e) }); }

// components/drift/DriftCard.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const CSS = `
.dtm-drift{ background:var(--surface-card); border:1px solid var(--border-hairline);
  border-radius:var(--radius-md); overflow:hidden; }
.dtm-drift--amber{ border-top:2px solid var(--amber); }
.dtm-drift--red{ border-top:2px solid var(--red); }

/* collapsed — one calm line in the feed */
.dtm-drift__line{ display:flex; align-items:center; gap:10px; padding:11px 14px; cursor:pointer;
  font-family:var(--font-mono); font-size:12.5px; transition:background var(--dur-fast); }
.dtm-drift__line:hover{ background:var(--surface-raised); }
.dtm-drift__sev{ width:7px; height:7px; border-radius:50%; flex:none; }
.dtm-drift__sev--amber{ background:var(--amber); }
.dtm-drift__sev--red{ background:var(--red); }
.dtm-drift__name{ color:var(--text-primary); }
.dtm-drift__trans{ color:var(--text-tertiary); }
.dtm-drift__trans .to{ color:var(--signal-amber); }
.dtm-drift__time{ color:var(--text-tertiary); margin-left:auto; font-feature-settings:"tnum" 1; }
.dtm-drift__chev{ color:var(--text-tertiary); display:inline-flex; }
.dtm-drift__chev svg{ width:13px; height:13px; display:block; transition:transform var(--dur-base) var(--ease-out); }
.dtm-drift--open .dtm-drift__chev svg{ transform:rotate(180deg); }

/* expanded */
.dtm-drift__head{ display:flex; align-items:flex-start; gap:12px; padding:14px 16px 12px;
  border-bottom:1px solid var(--border-hairline); }
.dtm-drift__eyebrow{ font-family:var(--font-mono); font-size:10px; letter-spacing:.06em;
  text-transform:uppercase; color:var(--text-tertiary); margin-bottom:5px; }
.dtm-drift__title{ font-family:var(--font-mono); font-size:16px; color:var(--text-primary); display:flex; align-items:center; gap:9px; flex-wrap:wrap; }
.dtm-drift__title .trans{ color:var(--text-tertiary); font-size:14px; }
.dtm-drift__title .to{ color:var(--signal-amber); }
.dtm-drift__ts{ margin-left:auto; font-family:var(--font-mono); font-size:11px; color:var(--text-tertiary); text-align:right; white-space:nowrap; }

.dtm-drift__life{ display:flex; gap:7px; flex-wrap:wrap; padding:12px 16px; border-bottom:1px solid var(--border-hairline); }

.dtm-drift__why{ padding:13px 16px; border-bottom:1px solid var(--border-hairline); }
.dtm-drift__quote{ font-family:var(--font-sans); font-size:13.5px; color:var(--text-primary); line-height:1.45; }
.dtm-drift__quote .who{ color:var(--text-tertiary); }
.dtm-drift__change{ margin-top:9px; display:inline-flex; align-items:center; gap:8px;
  font-family:var(--font-mono); font-size:12.5px; background:var(--bg-inset);
  border:1px solid var(--border-hairline); border-radius:var(--radius-sm); padding:6px 10px; }
.dtm-drift__change .old{ color:var(--text-tertiary); text-decoration:line-through; }
.dtm-drift__change .arr{ color:var(--text-tertiary); }
.dtm-drift__change .new{ color:var(--text-primary); }
.dtm-drift__change .mig{ color:var(--text-tertiary); margin-left:4px; }

.dtm-drift__radius{ display:flex; justify-content:center; padding:8px 12px 14px; border-bottom:1px solid var(--border-hairline); }

.dtm-drift__foot{ display:flex; align-items:center; gap:14px; padding:11px 16px; font-family:var(--font-mono); font-size:12px; }
.dtm-drift__link{ display:inline-flex; align-items:center; gap:6px; color:var(--text-secondary); cursor:pointer; }
.dtm-drift__link:hover{ color:var(--text-primary); }
.dtm-drift__link svg{ width:12px; height:12px; }
.dtm-drift__link .gd{ color:var(--signal-green); }
.dtm-drift__foot-sp{ margin-left:auto; color:var(--text-tertiary); }
`;
let injected = false;
function inject() {
  if (injected || typeof document === "undefined") return;
  injected = true;
  const s = document.createElement("style");
  s.setAttribute("data-dtm", "driftcard");
  s.textContent = CSS;
  document.head.appendChild(s);
}
const Chevron = () => /*#__PURE__*/React.createElement("svg", {
  viewBox: "0 0 16 16",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: "1.4",
  strokeLinecap: "round",
  strokeLinejoin: "round"
}, /*#__PURE__*/React.createElement("path", {
  d: "M4 6l4 4 4-4"
}));
const PR = () => /*#__PURE__*/React.createElement("svg", {
  viewBox: "0 0 16 16",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: "1.3"
}, /*#__PURE__*/React.createElement("circle", {
  cx: "4",
  cy: "4",
  r: "2"
}), /*#__PURE__*/React.createElement("circle", {
  cx: "4",
  cy: "12",
  r: "2"
}), /*#__PURE__*/React.createElement("circle", {
  cx: "12",
  cy: "12",
  r: "2"
}), /*#__PURE__*/React.createElement("path", {
  d: "M4 6v4M12 10V8a2 2 0 00-2-2H7",
  strokeLinecap: "round"
}));
const Book = () => /*#__PURE__*/React.createElement("svg", {
  viewBox: "0 0 16 16",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: "1.3"
}, /*#__PURE__*/React.createElement("path", {
  d: "M3 3h7a2 2 0 012 2v8H5a2 2 0 00-2 2z"
}), /*#__PURE__*/React.createElement("path", {
  d: "M12 5v8"
}));

/**
 * datum DriftCard — the hero component. A contract delta is a mini-incident
 * with a lifecycle. Collapsed it is one calm line in the feed; expanded
 * during live drift it owns the screen (header, lifecycle chips, the why,
 * the blast-radius graphic, resolution footer).
 */
function DriftCard({
  contract = "db.users",
  fromVersion = "v7",
  toVersion = "v8",
  timestamp = "14:02",
  severity = "red",
  quote = null,
  change = null,
  lifecycle = [],
  nodes = [],
  pr = null,
  ledger = null,
  defaultOpen = true,
  className = "",
  ...rest
}) {
  inject();
  const [open, setOpen] = React.useState(defaultOpen);
  const root = ["dtm-drift", `dtm-drift--${severity}`, open ? "dtm-drift--open" : "", className].filter(Boolean).join(" ");
  if (!open) {
    return /*#__PURE__*/React.createElement("div", _extends({
      className: root
    }, rest), /*#__PURE__*/React.createElement("div", {
      className: "dtm-drift__line",
      onClick: () => setOpen(true),
      role: "button",
      tabIndex: 0
    }, /*#__PURE__*/React.createElement("span", {
      className: `dtm-drift__sev dtm-drift__sev--${severity}`
    }), /*#__PURE__*/React.createElement("span", {
      className: "dtm-drift__name"
    }, contract), /*#__PURE__*/React.createElement("span", {
      className: "dtm-drift__trans"
    }, fromVersion, " \u2192 ", /*#__PURE__*/React.createElement("span", {
      className: "to"
    }, toVersion)), /*#__PURE__*/React.createElement("span", {
      className: "dtm-drift__time"
    }, timestamp), /*#__PURE__*/React.createElement("span", {
      className: "dtm-drift__chev"
    }, /*#__PURE__*/React.createElement(Chevron, null))));
  }
  return /*#__PURE__*/React.createElement("div", _extends({
    className: root
  }, rest), /*#__PURE__*/React.createElement("div", {
    className: "dtm-drift__head"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "dtm-drift__eyebrow"
  }, "contract delta"), /*#__PURE__*/React.createElement("div", {
    className: "dtm-drift__title"
  }, contract, /*#__PURE__*/React.createElement("span", {
    className: "trans"
  }, fromVersion, " \u2192 ", /*#__PURE__*/React.createElement("span", {
    className: "to"
  }, toVersion)))), /*#__PURE__*/React.createElement("div", {
    className: "dtm-drift__ts"
  }, timestamp, /*#__PURE__*/React.createElement("div", {
    className: "dtm-drift__chev",
    style: {
      float: "right",
      marginLeft: 8,
      cursor: "pointer"
    },
    onClick: () => setOpen(false)
  }, /*#__PURE__*/React.createElement(Chevron, null)))), lifecycle.length > 0 && (() => {
    // the live edge is the explicitly-current stage, else the last
    // completed (non-pending) one. Everything before it recedes.
    let currentIdx = lifecycle.findIndex(s => s.current);
    if (currentIdx < 0) {
      for (let i = 0; i < lifecycle.length; i++) if (!lifecycle[i].pending) currentIdx = i;
    }
    return /*#__PURE__*/React.createElement("div", {
      className: "dtm-drift__life"
    }, lifecycle.map((s, i) => /*#__PURE__*/React.createElement(__ds_scope.LifecycleChip, {
      key: i,
      stage: s.stage,
      elapsed: s.elapsed,
      label: s.label,
      pending: s.pending,
      done: !s.pending && i !== currentIdx
    })));
  })(), (quote || change) && /*#__PURE__*/React.createElement("div", {
    className: "dtm-drift__why"
  }, quote && /*#__PURE__*/React.createElement("div", {
    className: "dtm-drift__quote"
  }, "\"", quote.text, "\" ", /*#__PURE__*/React.createElement("span", {
    className: "who"
  }, "\u2014 ", quote.who)), change && /*#__PURE__*/React.createElement("div", {
    className: "dtm-drift__change"
  }, /*#__PURE__*/React.createElement("span", {
    className: "old"
  }, change.from), /*#__PURE__*/React.createElement("span", {
    className: "arr"
  }, "\u2192"), /*#__PURE__*/React.createElement("span", {
    className: "new"
  }, change.to), change.migration && /*#__PURE__*/React.createElement("span", {
    className: "mig"
  }, "\xB7 ", change.migration))), nodes.length > 0 && /*#__PURE__*/React.createElement("div", {
    className: "dtm-drift__radius"
  }, /*#__PURE__*/React.createElement(__ds_scope.BlastRadius, {
    delta: toVersion,
    nodes: nodes
  })), (pr || ledger) && /*#__PURE__*/React.createElement("div", {
    className: "dtm-drift__foot"
  }, pr && /*#__PURE__*/React.createElement("span", {
    className: "dtm-drift__link",
    onClick: pr.onClick
  }, /*#__PURE__*/React.createElement(PR, null), " ", pr.label, " ", /*#__PURE__*/React.createElement("span", {
    className: "gd"
  }, "open")), ledger && /*#__PURE__*/React.createElement("span", {
    className: "dtm-drift__link",
    onClick: ledger.onClick
  }, /*#__PURE__*/React.createElement(Book, null), " ", ledger.label), /*#__PURE__*/React.createElement("span", {
    className: "dtm-drift__foot-sp"
  }, "re-baselined")));
}
Object.assign(__ds_scope, { DriftCard });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/drift/DriftCard.jsx", error: String((e && e.message) || e) }); }

// components/tower/PresenceAvatar.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
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
function inject() {
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
function PresenceAvatar({
  initials,
  name,
  size = "md",
  active = false,
  ring = false,
  className = "",
  ...rest
}) {
  inject();
  const cls = ["dtm-av", `dtm-av--${size}`, active ? "dtm-av--active" : "", ring ? "dtm-av--ring" : "", className].filter(Boolean).join(" ");
  return /*#__PURE__*/React.createElement("span", _extends({
    className: cls,
    title: name || initials
  }, rest), initials, active && /*#__PURE__*/React.createElement("span", {
    className: "dtm-av__pulse"
  }));
}

/**
 * Overlapping group of sessions parked on a contract or file (Figma-style).
 */
function PresenceStack({
  sessions = [],
  max = 4,
  size = "md",
  className = "",
  ...rest
}) {
  inject();
  const shown = sessions.slice(0, max);
  const extra = sessions.length - shown.length;
  return /*#__PURE__*/React.createElement("span", _extends({
    className: ["dtm-stack", className].filter(Boolean).join(" ")
  }, rest), shown.map((s, i) => /*#__PURE__*/React.createElement(PresenceAvatar, {
    key: s.initials + i,
    initials: s.initials,
    name: s.name,
    active: s.active,
    size: size
  })), extra > 0 && /*#__PURE__*/React.createElement("span", {
    className: "dtm-stack__more"
  }, "+", extra));
}
Object.assign(__ds_scope, { PresenceAvatar, PresenceStack });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/tower/PresenceAvatar.jsx", error: String((e && e.message) || e) }); }

// components/tower/ContractRow.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
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
function inject() {
  if (injected || typeof document === "undefined") return;
  injected = true;
  const s = document.createElement("style");
  s.setAttribute("data-dtm", "contractrow");
  s.textContent = CSS;
  document.head.appendChild(s);
}
const Contract = () => /*#__PURE__*/React.createElement("svg", {
  viewBox: "0 0 16 16",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: "1.3",
  strokeLinecap: "round",
  strokeLinejoin: "round"
}, /*#__PURE__*/React.createElement("path", {
  d: "M4 2h5l3 3v9H4z"
}), /*#__PURE__*/React.createElement("path", {
  d: "M9 2v3h3"
}), /*#__PURE__*/React.createElement("path", {
  d: "M6 8.5h4M6 11h4"
}));

/**
 * datum ContractRow — one line in the current-truth registry: the contract
 * identifier, the sessions parked on it (presence), and its live version.
 */
function ContractRow({
  name,
  version,
  live = false,
  drift = false,
  sessions = [],
  interactive = true,
  onClick,
  className = "",
  ...rest
}) {
  inject();
  const cls = ["dtm-crow", interactive ? "dtm-crow--interactive" : "", className].filter(Boolean).join(" ");
  return /*#__PURE__*/React.createElement("div", _extends({
    className: cls,
    onClick: onClick
  }, rest), /*#__PURE__*/React.createElement("span", {
    className: "dtm-crow__name"
  }, /*#__PURE__*/React.createElement("span", {
    className: "ico"
  }, /*#__PURE__*/React.createElement(Contract, null)), name, drift && /*#__PURE__*/React.createElement("span", {
    className: "dtm-crow__drift",
    title: "drifting"
  })), /*#__PURE__*/React.createElement("span", {
    className: "dtm-crow__spacer"
  }), sessions.length > 0 && /*#__PURE__*/React.createElement(__ds_scope.PresenceStack, {
    sessions: sessions,
    size: "sm",
    max: 3
  }), /*#__PURE__*/React.createElement("span", {
    className: "dtm-crow__ver" + (live ? " dtm-crow__ver--live" : "")
  }, version));
}
Object.assign(__ds_scope, { ContractRow });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/tower/ContractRow.jsx", error: String((e && e.message) || e) }); }

// ui_kits/tower/Chrome.jsx
try { (() => {
// Tower chrome — left nav rail, top bar, epoch spine, app shell.
const {
  EpochStrip,
  Badge,
  PresenceStack
} = window.DatumDesignSystem_b409bf;
const Mark = ({
  size = 24
}) => /*#__PURE__*/React.createElement("svg", {
  width: size,
  height: size,
  viewBox: "0 0 48 48",
  fill: "none"
}, /*#__PURE__*/React.createElement("circle", {
  cx: "24",
  cy: "24",
  r: "12.5",
  stroke: "currentColor",
  strokeWidth: "2"
}), /*#__PURE__*/React.createElement("g", {
  stroke: "currentColor",
  strokeWidth: "2",
  strokeLinecap: "round"
}, /*#__PURE__*/React.createElement("line", {
  x1: "24",
  y1: "5",
  x2: "24",
  y2: "20.4"
}), /*#__PURE__*/React.createElement("line", {
  x1: "24",
  y1: "27.6",
  x2: "24",
  y2: "43"
}), /*#__PURE__*/React.createElement("line", {
  x1: "5",
  y1: "24",
  x2: "20.4",
  y2: "24"
}), /*#__PURE__*/React.createElement("line", {
  x1: "27.6",
  y1: "24",
  x2: "43",
  y2: "24"
})), /*#__PURE__*/React.createElement("circle", {
  cx: "24",
  cy: "24",
  r: "2.6",
  fill: "#F5A623"
}));
const I = {
  tower: /*#__PURE__*/React.createElement("path", {
    d: "M3 3h7v7H3zM3 13h7v4H3zM13 3h4v4h-4zM13 10h4v7h-4z"
  }),
  registry: /*#__PURE__*/React.createElement("g", null, /*#__PURE__*/React.createElement("path", {
    d: "M3 5c0-1.1 3-2 7-2s7 .9 7 2-3 2-7 2-7-.9-7-2z"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M3 5v5c0 1.1 3 2 7 2s7-.9 7-2V5M3 10v5c0 1.1 3 2 7 2s7-.9 7-2v-5"
  })),
  replay: /*#__PURE__*/React.createElement("g", null, /*#__PURE__*/React.createElement("path", {
    d: "M3 10a7 7 0 107-7 7 7 0 00-5 2.1L3 7"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M3 3v3h3M10 6.5V10l2.5 1.5"
  })),
  install: /*#__PURE__*/React.createElement("g", null, /*#__PURE__*/React.createElement("path", {
    d: "M3 3h14v14H3z"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M6 7l2.5 2L6 11M10 11h3",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  })),
  gear: /*#__PURE__*/React.createElement("g", null, /*#__PURE__*/React.createElement("circle", {
    cx: "10",
    cy: "10",
    r: "2.5"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M10 1.5v2M10 16.5v2M3.5 3.5l1.4 1.4M15.1 15.1l1.4 1.4M1.5 10h2M16.5 10h2M3.5 16.5l1.4-1.4M15.1 4.9l1.4-1.4",
    strokeLinecap: "round"
  })),
  sun: /*#__PURE__*/React.createElement("g", null, /*#__PURE__*/React.createElement("circle", {
    cx: "10",
    cy: "10",
    r: "3.5"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M10 2v2M10 16v2M2 10h2M16 10h2M4.2 4.2l1.4 1.4M14.4 14.4l1.4 1.4M4.2 15.8l1.4-1.4M14.4 5.6l1.4-1.4",
    strokeLinecap: "round"
  }))
};
function NavBtn({
  id,
  view,
  onNav,
  title
}) {
  const active = view === id;
  return /*#__PURE__*/React.createElement("button", {
    className: "tw-nav__btn",
    "data-active": active,
    onClick: () => onNav(id),
    title: title,
    "aria-label": title
  }, /*#__PURE__*/React.createElement("svg", {
    viewBox: "0 0 20 20",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "1.4"
  }, I[id]));
}
function AppShell({
  view,
  onNav,
  theme,
  onTheme,
  headerDrift = false,
  epoch = [],
  liveVer = "v8",
  tickKey = 0,
  animateTick = false,
  children
}) {
  const d = window.DATUM;
  return /*#__PURE__*/React.createElement("div", {
    className: "tw-shell"
  }, /*#__PURE__*/React.createElement("nav", {
    className: "tw-rail"
  }, /*#__PURE__*/React.createElement("div", {
    className: "tw-rail__mark"
  }, /*#__PURE__*/React.createElement(Mark, {
    size: 26
  })), /*#__PURE__*/React.createElement("div", {
    className: "tw-rail__nav"
  }, /*#__PURE__*/React.createElement(NavBtn, {
    id: "tower",
    view: view,
    onNav: onNav,
    title: "Tower"
  }), /*#__PURE__*/React.createElement(NavBtn, {
    id: "registry",
    view: view,
    onNav: onNav,
    title: "Registry"
  }), /*#__PURE__*/React.createElement(NavBtn, {
    id: "replay",
    view: view,
    onNav: onNav,
    title: "Replay"
  }), /*#__PURE__*/React.createElement(NavBtn, {
    id: "install",
    view: view,
    onNav: onNav,
    title: "Install"
  })), /*#__PURE__*/React.createElement("button", {
    className: "tw-nav__btn",
    onClick: onTheme,
    title: "Toggle theme",
    "aria-label": "Toggle theme"
  }, /*#__PURE__*/React.createElement("svg", {
    viewBox: "0 0 20 20",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "1.4"
  }, I.sun))), /*#__PURE__*/React.createElement("div", {
    className: "tw-main"
  }, /*#__PURE__*/React.createElement("header", {
    className: "tw-top"
  }, /*#__PURE__*/React.createElement("div", {
    className: "tw-top__ws"
  }, /*#__PURE__*/React.createElement("span", {
    className: "tw-top__org mono"
  }, d.workspace), /*#__PURE__*/React.createElement("span", {
    className: "tw-top__sep"
  }, "/"), /*#__PURE__*/React.createElement("span", {
    className: "tw-top__feat"
  }, d.feature)), /*#__PURE__*/React.createElement("div", {
    className: "tw-top__right"
  }, headerDrift ? /*#__PURE__*/React.createElement(Badge, {
    signal: "red",
    live: true
  }, "drift \xB7 1 reconciling") : /*#__PURE__*/React.createElement(Badge, {
    signal: "green",
    dot: true
  }, "all synced \xB7 v8"), /*#__PURE__*/React.createElement(PresenceStack, {
    sessions: d.sessions,
    max: 3
  }))), /*#__PURE__*/React.createElement("div", {
    className: "tw-epoch"
  }, /*#__PURE__*/React.createElement("span", {
    className: "eyebrow"
  }, "epoch"), /*#__PURE__*/React.createElement(EpochStrip, {
    key: tickKey,
    versions: epoch,
    showTimes: true,
    animateLive: animateTick
  }), /*#__PURE__*/React.createElement("span", {
    className: "tw-epoch__live mono",
    "data-live": liveVer === "v8"
  }, "live \xB7 ", liveVer)), /*#__PURE__*/React.createElement("div", {
    className: "tw-body"
  }, children)));
}
window.TowerChrome = {
  AppShell,
  Mark
};
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/tower/Chrome.jsx", error: String((e && e.message) || e) }); }

// ui_kits/tower/ExtraScreens.jsx
try { (() => {
// Install (onboarding) + Replay (forensics) screens.
const EX = window.DatumDesignSystem_b409bf;
function InstallScreen() {
  const [copied, setCopied] = React.useState(false);
  const hooks = [{
    e: "PreToolUse",
    f: ".claude/hooks/datum-fence.ts",
    d: "fence stale writes before they land"
  }, {
    e: "PostToolUse",
    f: ".claude/hooks/datum-claim.ts",
    d: "publish your claim + activity"
  }, {
    e: "SessionStart",
    f: ".claude/hooks/datum-join.ts",
    d: "register session on the workspace"
  }];
  return /*#__PURE__*/React.createElement("div", {
    className: "ix"
  }, /*#__PURE__*/React.createElement("div", {
    className: "ix__col"
  }, /*#__PURE__*/React.createElement("span", {
    className: "eyebrow"
  }, "install \xB7 one command"), /*#__PURE__*/React.createElement("h1", {
    className: "ix__h1"
  }, "point your agent at the datum"), /*#__PURE__*/React.createElement("p", {
    className: "ix__lede"
  }, "datum writes three Claude Code hooks and connects this repo to the live contract registry. nothing else changes in your loop."), /*#__PURE__*/React.createElement("div", {
    className: "ix__cmd mono",
    onClick: () => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "ix__prompt"
  }, "$"), /*#__PURE__*/React.createElement("span", {
    className: "ix__cmd-txt"
  }, "npx datum init ", /*#__PURE__*/React.createElement("span", {
    className: "dim"
  }, "--workspace acme/workspaces")), /*#__PURE__*/React.createElement("span", {
    className: "ix__copy"
  }, copied ? "copied" : "copy")), /*#__PURE__*/React.createElement("span", {
    className: "eyebrow",
    style: {
      marginTop: 22,
      display: "block"
    }
  }, "hooks written"), /*#__PURE__*/React.createElement("ul", {
    className: "ix__hooks"
  }, hooks.map(h => /*#__PURE__*/React.createElement("li", {
    className: "ix__hook",
    key: h.e
  }, /*#__PURE__*/React.createElement(EX.Badge, {
    signal: "neutral",
    size: "sm"
  }, h.e), /*#__PURE__*/React.createElement("span", {
    className: "ix__hook-f mono"
  }, h.f), /*#__PURE__*/React.createElement("span", {
    className: "ix__hook-d"
  }, h.d))))), /*#__PURE__*/React.createElement("div", {
    className: "ix__side"
  }, /*#__PURE__*/React.createElement("div", {
    className: "ix__live"
  }, /*#__PURE__*/React.createElement("div", {
    className: "ix__live-head"
  }, /*#__PURE__*/React.createElement("span", {
    className: "ix__live-dot"
  }), /*#__PURE__*/React.createElement("span", {
    className: "eyebrow",
    style: {
      color: "var(--signal-green)"
    }
  }, "first event received")), /*#__PURE__*/React.createElement("div", {
    className: "ix__live-rows mono"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("span", {
    className: "dim"
  }, "14:08:02"), " session ", /*#__PURE__*/React.createElement("b", null, "asha"), " joined \xB7 branch ", /*#__PURE__*/React.createElement("span", {
    className: "amber"
  }, "asha/schema")), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("span", {
    className: "dim"
  }, "14:08:02"), " claim published \xB7 ", /*#__PURE__*/React.createElement("span", {
    className: "dim"
  }, "data layer")), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("span", {
    className: "dim"
  }, "14:08:03"), " synced to ", /*#__PURE__*/React.createElement("span", {
    className: "amber"
  }, "v8"), " \xB7 4 contracts"), /*#__PURE__*/React.createElement("div", {
    className: "ix__live-ok"
  }, /*#__PURE__*/React.createElement("span", {
    className: "ix__ok"
  }, "\u2713"), " on datum \xB7 you are coordinated")))));
}
const LANES = [{
  who: "asha",
  branch: "asha/schema",
  events: [{
    at: 4,
    kind: "delta",
    label: "v8 · rename",
    t: "14:02:11"
  }]
}, {
  who: "ben",
  branch: "ben/api",
  events: [{
    at: 20,
    kind: "fenced",
    label: "write fenced",
    t: "+5.8s"
  }, {
    at: 46,
    kind: "advised",
    label: "advised",
    t: "+6.4s"
  }, {
    at: 76,
    kind: "reconciled",
    label: "reconciled",
    t: "+71s"
  }]
}, {
  who: "chen",
  branch: "chen/ui",
  events: [{
    at: 46,
    kind: "advised",
    label: "advised",
    t: "+6.4s"
  }, {
    at: 92,
    kind: "reconciled",
    label: "reconciled",
    t: "+89s"
  }]
}];
const KIND_VAR = {
  delta: "--amber",
  fenced: "--red",
  advised: "--blue",
  reconciled: "--green"
};
function ReplayScreen() {
  const [play, setPlay] = React.useState(96);
  return /*#__PURE__*/React.createElement("div", {
    className: "rp"
  }, /*#__PURE__*/React.createElement("div", {
    className: "rp__head"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("span", {
    className: "eyebrow"
  }, "replay \xB7 forensics"), /*#__PURE__*/React.createElement("h1", {
    className: "rp__h1 mono"
  }, "db.users v7 \u2192 v8 ", /*#__PURE__*/React.createElement("span", {
    className: "dim"
  }, "\xB7 14:02:11 \u2192 14:03:40 \xB7 89s window"))), /*#__PURE__*/React.createElement("div", {
    className: "rp__scrub"
  }, /*#__PURE__*/React.createElement("span", {
    className: "mono rp__scrub-t"
  }, "+", (play / 100 * 89).toFixed(1), "s"), /*#__PURE__*/React.createElement("input", {
    type: "range",
    min: "0",
    max: "100",
    value: play,
    onChange: e => setPlay(+e.target.value)
  }))), /*#__PURE__*/React.createElement("div", {
    className: "rp__lanes"
  }, /*#__PURE__*/React.createElement("div", {
    className: "rp__axis",
    style: {
      left: play + "%"
    }
  }), LANES.map(lane => /*#__PURE__*/React.createElement("div", {
    className: "rp__lane",
    key: lane.who
  }, /*#__PURE__*/React.createElement("div", {
    className: "rp__lane-label"
  }, /*#__PURE__*/React.createElement("span", {
    className: "rp__lane-who mono"
  }, lane.who), /*#__PURE__*/React.createElement("span", {
    className: "rp__lane-branch mono"
  }, lane.branch)), /*#__PURE__*/React.createElement("div", {
    className: "rp__track"
  }, lane.events.map((ev, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    className: "rp__ev",
    "data-on": ev.at <= play,
    style: {
      left: ev.at + "%",
      "--c": `var(${KIND_VAR[ev.kind]})`
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "rp__ev-dot"
  }), /*#__PURE__*/React.createElement("span", {
    className: "rp__ev-label mono"
  }, ev.label, /*#__PURE__*/React.createElement("span", {
    className: "rp__ev-t"
  }, ev.t)))))))), /*#__PURE__*/React.createElement("div", {
    className: "rp__foot mono"
  }, "detected 0.3s \xB7 fenced 5.8s \xB7 advised 6.4s \xB7 both reconciled by 14:03:40 \xB7 spec PR #14 at 14:04"));
}
window.InstallScreen = InstallScreen;
window.ReplayScreen = ReplayScreen;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/tower/ExtraScreens.jsx", error: String((e && e.message) || e) }); }

// ui_kits/tower/FleetFooter.jsx
try { (() => {
// Fleet status — a quiet metrics strip, never the point.
function FleetFooter() {
  const f = window.DATUM.fleet;
  const Metric = ({
    label,
    value,
    accent
  }) => /*#__PURE__*/React.createElement("div", {
    className: "tw-fleet__m"
  }, /*#__PURE__*/React.createElement("span", {
    className: "tw-fleet__v mono",
    "data-accent": accent || false
  }, value), /*#__PURE__*/React.createElement("span", {
    className: "tw-fleet__l"
  }, label));
  return /*#__PURE__*/React.createElement("footer", {
    className: "tw-fleet"
  }, /*#__PURE__*/React.createElement("div", {
    className: "tw-fleet__lead mono"
  }, /*#__PURE__*/React.createElement("span", {
    className: "tw-fleet__dot"
  }), "all sessions synced to ", /*#__PURE__*/React.createElement("span", {
    className: "amber"
  }, "v8"), " \xB7 ", f.agents, " agents live \xB7 last delta ", f.lastDelta), /*#__PURE__*/React.createElement("div", {
    className: "tw-fleet__metrics"
  }, /*#__PURE__*/React.createElement(Metric, {
    label: "deltas today",
    value: f.deltas
  }), /*#__PURE__*/React.createElement(Metric, {
    label: "writes fenced",
    value: f.fenced
  }), /*#__PURE__*/React.createElement(Metric, {
    label: "delta\u2192fence",
    value: f.deltaToFence
  }), /*#__PURE__*/React.createElement(Metric, {
    label: "rework avoided",
    value: f.reworkAvoided,
    accent: true
  })));
}
window.FleetFooter = FleetFooter;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/tower/FleetFooter.jsx", error: String((e && e.message) || e) }); }

// ui_kits/tower/RegistryScreen.jsx
try { (() => {
// Registry — current truth, browsable. Version history (who/when/why),
// presence, and a diff between two versions.
const RG = window.DatumDesignSystem_b409bf;
const DIFF = {
  "db.users": {
    a: "v7",
    b: "v8",
    hunks: [{
      t: "ctx",
      s: "table users ("
    }, {
      t: "ctx",
      s: "  id            uuid    pk"
    }, {
      t: "del",
      s: "  email         text    not null"
    }, {
      t: "add",
      s: "  contact_email text    not null"
    }, {
      t: "ctx",
      s: "  team_id       uuid    fk teams.id"
    }, {
      t: "ctx",
      s: "  last_seen_at  timestamptz"
    }, {
      t: "ctx",
      s: ")"
    }, {
      t: "note",
      s: "migration 0042 · asha · 14:02:11"
    }]
  }
};
function VersionHistory({
  contract
}) {
  return /*#__PURE__*/React.createElement("ol", {
    className: "rg-hist"
  }, contract.history.map((h, i) => /*#__PURE__*/React.createElement("li", {
    className: "rg-hist__row",
    key: h.v,
    "data-head": i === 0
  }, /*#__PURE__*/React.createElement("div", {
    className: "rg-hist__spine"
  }, /*#__PURE__*/React.createElement("span", {
    className: "rg-hist__dot",
    "data-live": i === 0 && contract.live
  })), /*#__PURE__*/React.createElement("div", {
    className: "rg-hist__body"
  }, /*#__PURE__*/React.createElement("div", {
    className: "rg-hist__meta mono"
  }, /*#__PURE__*/React.createElement("span", {
    className: "rg-hist__v",
    "data-live": i === 0 && contract.live
  }, h.v), /*#__PURE__*/React.createElement("span", {
    className: "rg-hist__who"
  }, h.who), /*#__PURE__*/React.createElement("span", {
    className: "rg-hist__time"
  }, h.time)), /*#__PURE__*/React.createElement("div", {
    className: "rg-hist__why"
  }, h.why)))));
}
function DiffView({
  name
}) {
  const diff = DIFF[name];
  if (!diff) {
    return /*#__PURE__*/React.createElement("div", {
      className: "rg-diff rg-diff--empty mono"
    }, "no breaking diff \xB7 ", name, " is reconciled");
  }
  return /*#__PURE__*/React.createElement("div", {
    className: "rg-diff"
  }, /*#__PURE__*/React.createElement("div", {
    className: "rg-diff__bar mono"
  }, /*#__PURE__*/React.createElement("span", null, "diff"), /*#__PURE__*/React.createElement("span", {
    className: "rg-diff__ab"
  }, diff.a, " \u2192 ", /*#__PURE__*/React.createElement("span", {
    className: "amber"
  }, diff.b))), /*#__PURE__*/React.createElement("pre", {
    className: "rg-diff__code"
  }, diff.hunks.map((h, i) => /*#__PURE__*/React.createElement("div", {
    className: "rg-diff__ln rg-diff__ln--" + h.t,
    key: i
  }, /*#__PURE__*/React.createElement("span", {
    className: "rg-diff__gut"
  }, h.t === "add" ? "+" : h.t === "del" ? "-" : h.t === "note" ? "✓" : " "), /*#__PURE__*/React.createElement("span", null, h.s)))));
}
function sessFor(initials) {
  return initials.map(i => window.DATUM.sessions.find(s => s.initials === i)).filter(Boolean);
}
function RegistryScreen() {
  const d = window.DATUM;
  const [sel, setSel] = React.useState(d.contracts[0].name);
  const contract = d.contracts.find(c => c.name === sel);
  return /*#__PURE__*/React.createElement("div", {
    className: "rg"
  }, /*#__PURE__*/React.createElement("div", {
    className: "rg__list"
  }, /*#__PURE__*/React.createElement("span", {
    className: "eyebrow",
    style: {
      padding: "0 12px 8px",
      display: "block"
    }
  }, "current truth \xB7 ", d.contracts.length, " contracts"), /*#__PURE__*/React.createElement("div", {
    className: "rg__rows"
  }, d.contracts.map(c => /*#__PURE__*/React.createElement("div", {
    key: c.name,
    className: "rg__rowwrap",
    "data-sel": c.name === sel,
    onClick: () => setSel(c.name)
  }, /*#__PURE__*/React.createElement(RG.ContractRow, {
    name: c.name,
    version: c.version,
    live: c.live,
    drift: c.drift,
    sessions: sessFor(c.sessions),
    interactive: false
  }))))), /*#__PURE__*/React.createElement("div", {
    className: "rg__detail"
  }, /*#__PURE__*/React.createElement("div", {
    className: "rg__detail-head"
  }, /*#__PURE__*/React.createElement("div", {
    className: "rg__title mono"
  }, contract.name, /*#__PURE__*/React.createElement("span", {
    className: "rg__title-v",
    "data-live": contract.live
  }, contract.version)), /*#__PURE__*/React.createElement("div", {
    className: "rg__presence"
  }, /*#__PURE__*/React.createElement("span", {
    className: "eyebrow"
  }, "building against"), /*#__PURE__*/React.createElement(RG.PresenceStack, {
    sessions: sessFor(contract.sessions),
    max: 3
  }))), /*#__PURE__*/React.createElement("div", {
    className: "rg__cols"
  }, /*#__PURE__*/React.createElement("div", {
    className: "rg__col"
  }, /*#__PURE__*/React.createElement("span", {
    className: "eyebrow"
  }, "version history \xB7 who / when / why"), /*#__PURE__*/React.createElement(VersionHistory, {
    contract: contract
  })), /*#__PURE__*/React.createElement("div", {
    className: "rg__col"
  }, /*#__PURE__*/React.createElement("span", {
    className: "eyebrow"
  }, "diff"), /*#__PURE__*/React.createElement(DiffView, {
    name: contract.name
  })))));
}
window.RegistryScreen = RegistryScreen;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/tower/RegistryScreen.jsx", error: String((e && e.message) || e) }); }

// ui_kits/tower/TowerApp.jsx
try { (() => {
// Tower — top-level app: view routing, theme, drift state.
const {
  AppShell
} = window.TowerChrome;
function TowerApp() {
  const [view, setView] = React.useState("tower");
  const [driftOn, setDriftOn] = React.useState(true);
  const [theme, setTheme] = React.useState("dark");
  const [stage, setStage] = React.useState("calm"); // drift-demo stage
  const [tickKey, setTickKey] = React.useState(0);
  React.useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);
  React.useEffect(() => {
    if (!driftOn) setStage("calm");
  }, [driftOn]);
  React.useEffect(() => {
    if (stage === "detected") setTickKey(k => k + 1);
  }, [stage]);
  const toggleTheme = () => setTheme(t => t === "dark" ? "light" : "dark");

  // epoch reflects the live arc on the drift view; elsewhere it shows synced truth (v8)
  const onDriftView = view === "tower" && driftOn;
  const ticked = onDriftView && stage !== "calm";
  const liveVer = !onDriftView ? "v8" : ticked ? "v8" : "v7";
  let epoch;
  if (!onDriftView) {
    epoch = window.DATUM.epoch;
  } else {
    epoch = [{
      v: "v5",
      time: "11:20",
      state: "past"
    }, {
      v: "v6",
      time: "12:08",
      state: "past"
    }, {
      v: "v7",
      time: "12:55",
      state: ticked ? "past" : "live"
    }];
    if (ticked) epoch.push({
      v: "v8",
      time: "14:02",
      state: "live"
    });
  }
  let screen,
    withFooter = true;
  if (view === "tower") screen = /*#__PURE__*/React.createElement(window.TowerHome, {
    driftOn: driftOn,
    onToggle: setDriftOn,
    onDriftStage: setStage
  });else if (view === "registry") screen = /*#__PURE__*/React.createElement(window.RegistryScreen, null);else if (view === "install") {
    screen = /*#__PURE__*/React.createElement(window.InstallScreen, null);
    withFooter = false;
  } else if (view === "replay") {
    screen = /*#__PURE__*/React.createElement(window.ReplayScreen, null);
    withFooter = false;
  }
  return /*#__PURE__*/React.createElement(AppShell, {
    view: view,
    onNav: setView,
    theme: theme,
    onTheme: toggleTheme,
    headerDrift: onDriftView && stage !== "calm" && stage !== "reconciled" && stage !== "patched",
    epoch: epoch,
    liveVer: liveVer,
    tickKey: tickKey,
    animateTick: ticked
  }, /*#__PURE__*/React.createElement("div", {
    className: "tw-scroll"
  }, screen), withFooter && /*#__PURE__*/React.createElement(window.FleetFooter, null));
}
ReactDOM.createRoot(document.getElementById("root")).render(/*#__PURE__*/React.createElement(TowerApp, null));
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/tower/TowerApp.jsx", error: String((e && e.message) || e) }); }

// ui_kits/tower/TowerHome.jsx
try { (() => {
// Tower home — calm state and drift state.
const TH = window.DatumDesignSystem_b409bf;
function sessionsFor(initials) {
  return initials.map(i => window.DATUM.sessions.find(s => s.initials === i)).filter(Boolean);
}
function AdvisoryCard({
  adv
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: "tw-adv"
  }, /*#__PURE__*/React.createElement("div", {
    className: "tw-adv__head"
  }, /*#__PURE__*/React.createElement(TH.Badge, {
    signal: "blue",
    dot: true
  }, "advisory"), /*#__PURE__*/React.createElement("span", {
    className: "tw-adv__to mono"
  }, "to ", adv.to), /*#__PURE__*/React.createElement("span", {
    className: "tw-adv__file mono"
  }, adv.file)), /*#__PURE__*/React.createElement("p", {
    className: "tw-adv__body"
  }, adv.text));
}
function CalmFeed() {
  const d = window.DATUM;
  // resting: every delta is a flat, equal-weight one-liner. no amber here —
  // the only amber on this screen is the live v8 marker in the epoch strip.
  const rows = [{
    name: d.drift.contract,
    from: d.drift.from,
    to: d.drift.to,
    time: d.drift.timestamp.slice(0, 5)
  }, {
    name: "api.GET /users/:id",
    from: "v2",
    to: "v3",
    time: "13:02"
  }, {
    name: "deps.db-driver",
    from: "v1",
    to: "v2",
    time: "10:30"
  }];
  return /*#__PURE__*/React.createElement("div", {
    className: "tw-calm"
  }, /*#__PURE__*/React.createElement("div", {
    className: "tw-calm__note mono"
  }, /*#__PURE__*/React.createElement("span", {
    className: "tw-calm__pip"
  }), " nothing pulses \xB7 ", d.fleet.agents, " agents building against current truth"), rows.map(r => /*#__PURE__*/React.createElement("div", {
    className: "tw-calm__delta-line mono",
    key: r.name
  }, /*#__PURE__*/React.createElement("span", {
    className: "tw-calm__sev"
  }), " ", r.name, " ", /*#__PURE__*/React.createElement("span", {
    className: "dim"
  }, r.from, " \u2192 ", r.to), /*#__PURE__*/React.createElement("span", {
    className: "tw-calm__t"
  }, r.time))));
}
function DriftState({
  onStageChange
}) {
  const d = window.DATUM;
  const ref = React.useRef(null);
  const [stage, setStage] = React.useState("calm");
  const order = {
    calm: 0,
    detected: 1,
    fenced: 2,
    advised: 3,
    reconciling: 4,
    reconciled: 5,
    patched: 6
  };
  const handle = s => {
    setStage(s);
    if (onStageChange) onStageChange(s);
  };
  const showAdv = (order[stage] || 0) >= order.advised;
  return /*#__PURE__*/React.createElement("div", {
    className: "tw-drift"
  }, /*#__PURE__*/React.createElement("div", {
    className: "tw-drift__phase"
  }, /*#__PURE__*/React.createElement("span", {
    className: "eyebrow"
  }, "live arc"), /*#__PURE__*/React.createElement("div", {
    className: "tw-arc-ctrl"
  }, /*#__PURE__*/React.createElement("button", {
    className: "tw-arc-btn",
    onClick: () => ref.current && ref.current.fire()
  }, "\u25B6 fire delta"), /*#__PURE__*/React.createElement("button", {
    className: "tw-arc-btn tw-arc-btn--ghost",
    onClick: () => ref.current && ref.current.reset()
  }, "reset"))), /*#__PURE__*/React.createElement(TH.LiveDriftCard, {
    ref: ref,
    autoPlay: true,
    onStageChange: handle,
    nodes: [{
      initials: "be",
      who: "ben",
      label: "routes/users.ts"
    }, {
      initials: "ch",
      who: "chen",
      label: "UserCard.tsx"
    }],
    pr: {
      label: "spec PR #14"
    },
    ledger: {
      label: "ledger #112"
    }
  }), showAdv && /*#__PURE__*/React.createElement("div", {
    className: "tw-adv-wrap"
  }, /*#__PURE__*/React.createElement("span", {
    className: "eyebrow"
  }, "advisories \xB7 per recipient"), d.drift.advisories.map(a => /*#__PURE__*/React.createElement(AdvisoryCard, {
    key: a.to,
    adv: a
  }))));
}
function Rail() {
  const d = window.DATUM;
  return /*#__PURE__*/React.createElement("aside", {
    className: "tw-rail-col"
  }, /*#__PURE__*/React.createElement(TH.Card, {
    eyebrow: "current truth",
    title: "registry",
    flush: true,
    actions: /*#__PURE__*/React.createElement("button", {
      className: "tw-link mono"
    }, "browse \u2192")
  }, /*#__PURE__*/React.createElement("div", null, d.contracts.map(c => /*#__PURE__*/React.createElement(TH.ContractRow, {
    key: c.name,
    name: c.name,
    version: c.version,
    live: c.live,
    drift: c.drift,
    sessions: sessionsFor(c.sessions)
  })))), /*#__PURE__*/React.createElement(TH.Card, {
    eyebrow: "decision history",
    title: "ledger",
    flush: true
  }, /*#__PURE__*/React.createElement("div", null, d.ledger.slice(0, 5).map((l, i) => /*#__PURE__*/React.createElement(TH.LedgerEntry, {
    key: l.id,
    id: l.id,
    time: l.time,
    who: l.who,
    head: i === 0,
    summary: l.contract ? /*#__PURE__*/React.createElement("span", null, l.summary, " ", /*#__PURE__*/React.createElement("span", {
      className: "amber"
    }, l.contract), " \xB7 ", l.tail) : l.summary
  })))));
}
function TowerHome({
  driftOn,
  onToggle,
  onDriftStage
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: "tw-home"
  }, /*#__PURE__*/React.createElement("div", {
    className: "tw-home__main"
  }, /*#__PURE__*/React.createElement("div", {
    className: "tw-home__head"
  }, /*#__PURE__*/React.createElement("h1", {
    className: "tw-home__title"
  }, "tower"), /*#__PURE__*/React.createElement("div", {
    className: "tw-seg",
    role: "tablist"
  }, /*#__PURE__*/React.createElement("button", {
    className: "tw-seg__b",
    "data-on": !driftOn,
    onClick: () => onToggle(false)
  }, "calm"), /*#__PURE__*/React.createElement("button", {
    className: "tw-seg__b",
    "data-on": driftOn,
    onClick: () => onToggle(true)
  }, "drift"))), driftOn ? /*#__PURE__*/React.createElement(DriftState, {
    onStageChange: onDriftStage
  }) : /*#__PURE__*/React.createElement(CalmFeed, null)), /*#__PURE__*/React.createElement(Rail, null));
}
window.TowerHome = TowerHome;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/tower/TowerHome.jsx", error: String((e && e.message) || e) }); }

// ui_kits/tower/data.js
try { (() => {
// datum · Tower sample data — verbatim from the product brief.
// Realistic data over lorem ipsum, everywhere.
window.DATUM = {
  workspace: "acme/workspaces",
  feature: "workspace invites",
  epoch: [{
    v: "v5",
    time: "11:20",
    state: "past"
  }, {
    v: "v6",
    time: "12:08",
    state: "past"
  }, {
    v: "v7",
    time: "12:55",
    state: "past"
  }, {
    v: "v8",
    time: "14:02",
    state: "live"
  }],
  sessions: [{
    initials: "as",
    name: "asha",
    scope: "data layer",
    branch: "asha/schema",
    active: true
  }, {
    initials: "be",
    name: "ben",
    scope: "api",
    branch: "ben/api",
    active: true
  }, {
    initials: "ch",
    name: "chen",
    scope: "frontend",
    branch: "chen/ui",
    active: true
  }],
  contracts: [{
    name: "db.users",
    version: "v8",
    live: true,
    drift: true,
    sessions: ["as", "be"],
    history: [{
      v: "v8",
      time: "14:02",
      who: "asha",
      why: "rename users.email → contact_email (phone signups)"
    }, {
      v: "v7",
      time: "12:55",
      who: "asha",
      why: "add users.last_seen_at"
    }, {
      v: "v6",
      time: "12:08",
      who: "asha",
      why: "index on users.team_id"
    }]
  }, {
    name: "api.GET /users/:id",
    version: "v3",
    sessions: ["be", "ch"],
    history: [{
      v: "v3",
      time: "13:02",
      who: "ben",
      why: "UserDTO drops password_hash"
    }, {
      v: "v2",
      time: "11:40",
      who: "ben",
      why: "add UserDTO.last_seen_at"
    }]
  }, {
    name: "api.POST /invites",
    version: "v1",
    sessions: ["be"],
    history: [{
      v: "v1",
      time: "13:18",
      who: "ben",
      why: "returns 202 + job id"
    }]
  }, {
    name: "deps.db-driver",
    version: "v2",
    sessions: ["as"],
    history: [{
      v: "v2",
      time: "10:30",
      who: "asha",
      why: "bump pg 8.11 → 8.12"
    }]
  }],
  drift: {
    contract: "db.users",
    from: "v7",
    to: "v8",
    timestamp: "14:02:11",
    severity: "red",
    lifecycle: [{
      stage: "detected",
      elapsed: "0.3s"
    }, {
      stage: "fenced",
      elapsed: "5.8s"
    }, {
      stage: "advised",
      elapsed: "6.4s"
    }, {
      stage: "reconciled",
      elapsed: "2/2",
      current: true
    }],
    quote: {
      who: "asha",
      text: "phone signups make email the wrong name."
    },
    change: {
      from: "users.email",
      to: "contact_email",
      migration: "migration 0042"
    },
    nodes: [{
      initials: "be",
      label: "routes/users.ts",
      status: "reconciled"
    }, {
      initials: "ch",
      label: "UserCard.tsx",
      status: "reconciled"
    }],
    advisories: [{
      to: "ben",
      file: "routes/users.ts",
      text: "users.email is now contact_email (migration 0042, asha). Your open diff selects .email in two queries; update both before your next write."
    }, {
      to: "chen",
      file: "UserCard.tsx",
      text: "UserDTO.email renamed; regenerate types from the API client. UserCard.tsx line 18 reads user.email and will break at runtime."
    }]
  },
  // the money shot: the incident mid-flight, the moment the migration lands —
  // detected+fenced complete, advised in progress, reconciled not yet reached.
  driftMid: {
    contract: "db.users",
    from: "v7",
    to: "v8",
    timestamp: "14:02:07",
    severity: "red",
    lifecycle: [{
      stage: "detected",
      elapsed: "0.3s"
    }, {
      stage: "fenced",
      elapsed: "5.8s"
    }, {
      stage: "advised",
      elapsed: "live",
      current: true
    }, {
      stage: "reconciled",
      pending: true
    }],
    quote: {
      who: "asha",
      text: "phone signups make email the wrong name."
    },
    change: {
      from: "users.email",
      to: "contact_email",
      migration: "migration 0042"
    },
    nodes: [{
      initials: "be",
      label: "routes/users.ts",
      status: "fenced"
    }, {
      initials: "ch",
      label: "UserCard.tsx",
      status: "advised"
    }],
    advisories: [{
      to: "ben",
      file: "routes/users.ts",
      text: "your write touches users.email, renamed to contact_email 5.8s ago (migration 0042, asha). it's fenced until you re-baseline — pull v8 and re-run your diff."
    }, {
      to: "chen",
      file: "UserCard.tsx",
      text: "UserDTO.email renamed; regenerate types from the API client. UserCard.tsx line 18 reads user.email and will break at runtime."
    }]
  },
  ledger: [{
    id: 112,
    time: "14:02",
    who: "asha",
    summary: "rename users.email",
    tail: "phone signups landing",
    contract: "db.users"
  }, {
    id: 111,
    time: "13:41",
    who: "chen",
    summary: "adopt zod for DTO parsing"
  }, {
    id: 110,
    time: "13:18",
    who: "ben",
    summary: "invites API returns 202 + job id"
  }, {
    id: 109,
    time: "12:55",
    who: "asha",
    summary: "add users.last_seen_at"
  }, {
    id: 108,
    time: "12:08",
    who: "asha",
    summary: "index on users.team_id"
  }],
  fleet: {
    deltas: 4,
    fenced: 3,
    deltaToFence: "5.8s",
    reworkAvoided: "~412k tokens",
    agents: 3,
    lastDelta: "4m ago"
  }
};
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/tower/data.js", error: String((e && e.message) || e) }); }

__ds_ns.Badge = __ds_scope.Badge;

__ds_ns.Button = __ds_scope.Button;

__ds_ns.Card = __ds_scope.Card;

__ds_ns.Input = __ds_scope.Input;

__ds_ns.Tag = __ds_scope.Tag;

__ds_ns.BlastRadius = __ds_scope.BlastRadius;

__ds_ns.DriftCard = __ds_scope.DriftCard;

__ds_ns.LiveDriftCard = __ds_scope.LiveDriftCard;

__ds_ns.ContractRow = __ds_scope.ContractRow;

__ds_ns.EpochStrip = __ds_scope.EpochStrip;

__ds_ns.LedgerEntry = __ds_scope.LedgerEntry;

__ds_ns.LifecycleChip = __ds_scope.LifecycleChip;

__ds_ns.PresenceAvatar = __ds_scope.PresenceAvatar;

__ds_ns.PresenceStack = __ds_scope.PresenceStack;

})();
