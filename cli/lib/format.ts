// cli/lib/format.ts — terminal rendering for the datum cockpit.
//
// The STRICT color discipline (design context §"Aesthetic direction"):
//   amber  = contract-surface activity + the live epoch
//   red    = breaking deltas + fences
//   blue   = advisories
//   green  = reconciled + synced
//   gray   = ambient activity (timestamps, chrome, separators)
//   plain  = identifiers (contract names, paths, versions) — steady, never tinted
//
// The ⌖ benchmark glyph is the brand mark. ANSI auto-disables when stdout is not
// a TTY, when NO_COLOR is set, or when --no-color is passed. A --json path bypasses
// all of this and prints machine JSON instead.

// ---- color enablement ----

let COLOR_ENABLED = computeColorDefault();

function computeColorDefault(): boolean {
  if (process.env.NO_COLOR != null && process.env.NO_COLOR !== "") return false;
  if (!process.stdout || !process.stdout.isTTY) return false;
  return true;
}

/** Force-disable color (router calls this for --no-color and --json). */
export function disableColor(): void {
  COLOR_ENABLED = false;
}

/** Force-enable color (tests may opt in to assert escapes are present). */
export function enableColor(): void {
  COLOR_ENABLED = true;
}

export function colorEnabled(): boolean {
  return COLOR_ENABLED;
}

// ---- raw SGR codes ----

const SGR = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  amber: "\x1b[38;5;214m", // contract / epoch
  red: "\x1b[38;5;203m", // fence / breaking
  blue: "\x1b[38;5;75m", // advisory
  green: "\x1b[38;5;78m", // synced / reconciled
  gray: "\x1b[38;5;245m", // ambient
} as const;

function wrap(code: string, s: string): string {
  if (!COLOR_ENABLED) return s;
  return `${code}${s}${SGR.reset}`;
}

// ---- the discipline (named by meaning, never by hue) ----

/** amber — contract-surface activity + the live epoch. */
export const contract = (s: string): string => wrap(SGR.amber, s);
export const epoch = (s: string): string => wrap(SGR.amber, s);
/** red — breaking deltas + fences. */
export const fence = (s: string): string => wrap(SGR.red, s);
export const breaking = (s: string): string => wrap(SGR.red, s);
/** blue — advisories. */
export const advisory = (s: string): string => wrap(SGR.blue, s);
/** green — reconciled + synced. */
export const synced = (s: string): string => wrap(SGR.green, s);
export const reconciled = (s: string): string => wrap(SGR.green, s);
/** gray — ambient (timestamps, chrome, separators). */
export const ambient = (s: string): string => wrap(SGR.gray, s);
export const dim = (s: string): string => wrap(SGR.dim, s);
export const bold = (s: string): string => wrap(SGR.bold, s);

/** Identifiers stay steady — never tinted. Mono in the eye of the reader. */
export const ident = (s: string): string => s;

/** The ⌖ benchmark mark, amber when color is on. */
export const MARK = "⌖";
export const mark = (): string => contract(MARK);

// ---- chip + status helpers ----

export type ChipTone = "contract" | "fence" | "advisory" | "synced" | "ambient";

/** A bracketed lifecycle/status chip, e.g. [detected 0.3s]. */
export function chip(label: string, tone: ChipTone = "ambient"): string {
  const inner = `[${label}]`;
  switch (tone) {
    case "contract":
      return contract(inner);
    case "fence":
      return fence(inner);
    case "advisory":
      return advisory(inner);
    case "synced":
      return synced(inner);
    default:
      return ambient(inner);
  }
}

/** A severity-toned tick for sessions/files. */
export function statusTick(status: string): string {
  switch (status) {
    case "synced":
    case "reconciled":
      return synced("✓"); // ✓
    case "fenced":
      return fence("✗"); // ✗
    case "reconciling":
      return advisory("↻"); // ↻
    default:
      return ambient("·"); // ·
  }
}

// ---- epoch strip ----

/**
 * The epoch strip — the spine that renders on every cockpit view:
 *   o----o----o(v7)----●(v8 · live)
 * `current` is amber and live; trailing dots are ambient.
 */
export function epochStrip(current: number, opts: { prevCount?: number } = {}): string {
  const prev = Math.max(0, opts.prevCount ?? 3);
  const lead = Array.from({ length: prev }, () => ambient("o")).join(ambient("────"));
  const head = epoch(bold(`● v${current}`)) + " " + ambient("· live");
  if (prev <= 0) return head;
  return `${lead}${ambient("────")}${head}`;
}

// ---- epoch-strip helper (string form, for tower-glance microcopy) ----

/**
 * Cartographic sync microcopy: "synced to v8" (green) or "off datum by N
 * versions" (amber/red). Returns the styled phrase only — callers prepend context.
 */
export function syncPhrase(lastSynced: number, current: number): string {
  const behind = current - lastSynced;
  if (behind <= 0) return synced(`synced to v${current}`);
  const v = behind === 1 ? "version" : "versions";
  return fence(`off datum by ${behind} ${v}`) + ambient(` (synced to v${lastSynced}, truth at v${current})`);
}

// ---- presence initials ----

/** Presence avatar = a human's initial in steady brackets, e.g. [a]. */
export function presence(human: string): string {
  const initial = (human || "?").trim().charAt(0).toLowerCase() || "?";
  return ident(`[${initial}]`);
}

// ---- table ----

export type Row = string[];

/**
 * Render a left-aligned, gutter-padded table. Cell content may carry ANSI; the
 * width is computed against the VISIBLE width (escapes stripped) so columns line
 * up regardless of color.
 */
export function table(rows: Row[], opts: { gutter?: number; indent?: string } = {}): string {
  if (rows.length === 0) return "";
  const gutter = opts.gutter ?? 2;
  const indent = opts.indent ?? "";
  const cols = Math.max(...rows.map((r) => r.length));
  const widths: number[] = [];
  for (let c = 0; c < cols; c++) {
    widths[c] = Math.max(...rows.map((r) => visibleWidth(r[c] ?? "")));
  }
  const pad = " ".repeat(gutter);
  return rows
    .map((r) =>
      indent +
      r
        .map((cell, c) => {
          const text = cell ?? "";
          // last column is not padded.
          if (c === r.length - 1 || c === cols - 1) return text;
          return text + " ".repeat(Math.max(0, widths[c] - visibleWidth(text)));
        })
        .join(pad)
        .trimEnd(),
    )
    .join("\n");
}

// ---- ANSI utilities ----

const ANSI_RE = /\x1b\[[0-9;]*m/g;

/** Strip ANSI escapes (for width math + tests). */
export function stripAnsi(s: string): string {
  return s.replace(ANSI_RE, "");
}

function visibleWidth(s: string): number {
  return stripAnsi(s).length;
}

// ---- epoch-strip helper for raw version tokens ----

/** A bare version token "v8" rendered amber (the epoch hue). */
export function vtag(version: number): string {
  return epoch(`v${version}`);
}

// ---- relative time ----

/** Compact relative time from an ISO timestamp, e.g. "4m ago", "just now". */
export function relTime(iso: string | undefined, now: number = Date.now()): string {
  if (!iso) return "";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  const diff = Math.max(0, now - t);
  const s = Math.round(diff / 1000);
  if (s < 5) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return `${d}d ago`;
}

// ---- output ----
//
// All cockpit text + machine JSON flows through a redirectable SINK so the test
// harness can capture it WITHOUT monkey-patching process.stdout (which would
// race the node:test reporter). The default sink writes to process.stdout.

type Sink = (chunk: string) => void;
let stdoutSink: Sink = (chunk) => {
  process.stdout.write(chunk);
};
let stderrSink: Sink = (chunk) => {
  process.stderr.write(chunk);
};

/**
 * Capture cockpit output during fn(). Returns the captured stdout + stderr.
 * Restores the sinks afterward even if fn throws. Tests use this instead of
 * patching process.stdout (so the test reporter keeps its own stdout).
 */
export async function captureOutput<T>(
  fn: () => Promise<T>,
): Promise<{ stdout: string; stderr: string; result: T }> {
  const so: string[] = [];
  const se: string[] = [];
  const prevOut = stdoutSink;
  const prevErr = stderrSink;
  stdoutSink = (c) => so.push(c);
  stderrSink = (c) => se.push(c);
  try {
    const result = await fn();
    return { stdout: so.join(""), stderr: se.join(""), result };
  } finally {
    stdoutSink = prevOut;
    stderrSink = prevErr;
  }
}

/** Print a line to stdout (cockpit text). */
export function out(line = ""): void {
  stdoutSink(line + "\n");
}

/** Print machine JSON to stdout (the --json path). */
export function emitJson(value: unknown): void {
  stdoutSink(JSON.stringify(value, null, 2) + "\n");
}

/** A one-line ambient warning to stderr (fail-soft; never a stack trace). */
export function warn(line: string): void {
  stderrSink(`${MARK} datum: ${line}\n`);
}
