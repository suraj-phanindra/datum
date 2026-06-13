import React from "react";
declare namespace JSX { interface Element {} }

export interface EpochNode {
  /** Version label, e.g. "v8". */
  v: string;
  /** Optional timestamp shown beneath when showTimes is set. */
  time?: string;
  /** Lifecycle position. "live" is the current epoch (amber). */
  state?: "past" | "current" | "live";
}

/**
 * Props for the epoch (version) spine.
 * @startingPoint section="Tower" subtitle="The version spine — v5 … v8 live" viewport="700x140"
 */
export interface EpochStripProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Ordered versions, oldest → newest. The newest is usually `state:"live"`. */
  versions: EpochNode[];
  /** Show timestamps beneath each node. */
  showTimes?: boolean;
  /** Play the version-tick entrance on the newly-live (last) node + its connector. Remount (key) to replay. */
  animateLive?: boolean;
}

/** The version spine present on every tower surface. */
export function EpochStrip(props: EpochStripProps): JSX.Element;
