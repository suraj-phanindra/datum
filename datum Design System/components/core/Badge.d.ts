import React from "react";
declare namespace JSX { interface Element {} }

/**
 * Props for the status badge.
 * @startingPoint section="Core" subtitle="Semantic status badges" viewport="700x460"
 */
export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** Semantic hue. Use the meaning, never the color for decoration. */
  signal?: "neutral" | "amber" | "red" | "blue" | "green";
  /** `soft` tint (default) or `solid` fill. */
  variant?: "soft" | "solid";
  size?: "sm" | "md";
  /** Show the leading status dot. */
  dot?: boolean;
  /** Pulsing dot for a live state (implies dot). */
  live?: boolean;
  children?: React.ReactNode;
}

/** Status pill with strictly-semantic color. */
export function Badge(props: BadgeProps): JSX.Element;
