import React from "react";
declare namespace JSX { interface Element {} }

export type LifecycleStage = "detected" | "fenced" | "advised" | "reconciled" | "patched";

/**
 * Props for a single lifecycle chip.
 * @startingPoint section="Tower" subtitle="Delta lifecycle chips with elapsed times" viewport="700x130"
 */
export interface LifecycleChipProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** Which lifecycle stage. Drives icon + signal hue. */
  stage?: LifecycleStage;
  /** Elapsed time string, e.g. "5.8s" or "2/2". */
  elapsed?: string | null;
  /** Override the default stage label. */
  label?: string | null;
  /** Dim + dashed for a not-yet-reached stage. */
  pending?: boolean;
  /** Completed: recede to low-contrast gray with a small colored dot. Reserve full color for the one live stage. */
  done?: boolean;
}

/** One stage of a delta's lifecycle with its elapsed time. */
export function LifecycleChip(props: LifecycleChipProps): JSX.Element;
