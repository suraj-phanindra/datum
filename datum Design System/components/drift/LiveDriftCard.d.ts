import React from "react";
declare namespace JSX { interface Element {} }

export type DriftStageName =
  | "calm" | "detected" | "fenced" | "advised"
  | "reconciling" | "reconciled" | "patched";

export type DriftEvent =
  | "delta.detected" | "write.fenced" | "advisory.delivered"
  | "reconcile.ben" | "reconcile.chen" | "spec.pr.opened" | "reset";

export interface LiveDriftNode {
  /** Session initials, e.g. "be". */
  initials: string;
  /** Session name, e.g. "ben". */
  who: string;
  /** Affected file, e.g. "routes/users.ts". */
  label: string;
}

export interface LiveDriftHandle {
  /** Run the scripted emitter (compressed ~8s arc). */
  fire(): void;
  /** Return to calm and clear all timers. */
  reset(): void;
  /** Feed one event from a live bus. */
  emit(event: DriftEvent): void;
  getStage(): DriftStageName;
}

export interface LiveDriftCardProps extends React.HTMLAttributes<HTMLDivElement> {
  contract?: string;
  fromVersion?: string;
  toVersion?: string;
  timestamp?: string;
  quote?: { who: string; text: string };
  change?: { from: string; to: string; migration?: string };
  /** Exactly two consumer nodes (ben, chen) for the blast radius. */
  nodes?: LiveDriftNode[];
  pr?: { label: string } | null;
  ledger?: { label: string } | null;
  /** Start the scripted arc shortly after mount. */
  autoPlay?: boolean;
  /** Loop the scripted arc (demo / kiosk). */
  loop?: boolean;
  /** Called with the new stage name on every transition. */
  onStageChange?: (stage: DriftStageName) => void;
}

/**
 * The drift card as an event-driven state machine. One render path; drive it
 * with `fire()` (scripted/replay), or feed a live bus via `emit(event)`.
 * Honors prefers-reduced-motion (crossfades, no ripple/punch/draw/pulse).
 * Grab the imperative handle with a ref typed as LiveDriftHandle.
 */
export const LiveDriftCard: React.ForwardRefExoticComponent<
  LiveDriftCardProps & React.RefAttributes<LiveDriftHandle>
>;
