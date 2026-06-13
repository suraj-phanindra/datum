import React from "react";
declare namespace JSX { interface Element {} }

export type NodeStatus = "fenced" | "advised" | "reconciled" | "pending";

export interface BlastNode {
  /** Session initials, e.g. "be" for ben. */
  initials: string;
  /** File / target label, e.g. "routes/users.ts". */
  label: string;
  /** Lifecycle status — drives the node + connector hue. */
  status: NodeStatus;
}

/**
 * Props for the blast-radius graphic.
 * @startingPoint section="Drift" subtitle="The signature blast-radius graphic" viewport="700x260"
 */
export interface BlastRadiusProps extends React.SVGAttributes<SVGSVGElement> {
  /** Center delta label, e.g. "v8". */
  delta?: string;
  /** Affected sessions / files arranged on the survey radius. */
  nodes: BlastNode[];
  width?: number;
  height?: number;
  /** Override the arc spread (degrees). */
  arc?: number | null;
}

/** The signature radial graphic: a delta at center, blast radius around it. */
export function BlastRadius(props: BlastRadiusProps): JSX.Element;
