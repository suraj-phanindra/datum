import React from "react";

const STATUS_VAR = {
  fenced: "--red",
  advised: "--blue",
  reconciled: "--green",
  pending: "--text-tertiary",
};
const STATUS_GLYPH = { fenced: "fenced", advised: "advised", reconciled: "reconciled", pending: "pending" };

/**
 * datum BlastRadius — the product's signature graphic. The delta sits at the
 * center (amber); the affected sessions/files sit close on either side so the
 * two connectors are the dominant shape. Each node carries its lifecycle hue.
 * No survey rings — the connecting lines are the figure.
 */
export function BlastRadius({
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
    const rad = (deg * Math.PI) / 180;
    return { ...nd, x: cx + Math.cos(rad) * R, y: cy + Math.sin(rad) * R };
  });

  return (
    <svg className={["dtm-blast", className].filter(Boolean).join(" ")}
      width="100%" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid meet"
      fill="none" xmlns="http://www.w3.org/2000/svg" {...rest}>

      {/* connectors — the dominant shape */}
      {placed.map((p, i) => (
        <line key={"l" + i} x1={cx} y1={cy} x2={p.x} y2={p.y}
          stroke={`var(${STATUS_VAR[p.status] || "--border-strong"})`} strokeWidth="2" opacity="0.7" />
      ))}

      {/* center delta */}
      <circle cx={cx} cy={cy} r="19" fill="var(--signal-amber-tint)" stroke="var(--signal-amber-line)" strokeWidth="1.5" />
      <circle cx={cx} cy={cy} r="7" fill="var(--amber)">
        <animate attributeName="opacity" values="1;0.55;1" dur="2s" repeatCount="indefinite" />
      </circle>
      <text x={cx} y={cy - 28} textAnchor="middle" fontFamily="var(--font-mono)" fontSize="15"
        fill="var(--signal-amber)" fontWeight="600">{delta}</text>

      {/* nodes */}
      {placed.map((p, i) => {
        const col = `var(${STATUS_VAR[p.status] || "--text-tertiary"})`;
        return (
          <g key={"n" + i}>
            <circle cx={p.x} cy={p.y} r="17" fill="var(--surface-raised)" stroke={col} strokeWidth="2" />
            <text x={p.x} y={p.y + 4.5} textAnchor="middle" fontFamily="var(--font-mono)" fontSize="13"
              fill="var(--text-primary)">{p.initials}</text>
            <text x={p.x + 24} y={p.y - 2} textAnchor="start"
              fontFamily="var(--font-mono)" fontSize="13" fontWeight="500" fill="var(--text-primary)">{p.label}</text>
            <text x={p.x + 24} y={p.y + 14} textAnchor="start"
              fontFamily="var(--font-mono)" fontSize="12" fill={col}>{STATUS_GLYPH[p.status] || p.status}</text>
          </g>
        );
      })}
    </svg>
  );
}
