import React from "react";
declare namespace JSX { interface Element {} }

/**
 * Props for the surface panel.
 * @startingPoint section="Core" subtitle="Surface panel with header & severity" viewport="700x460"
 */
export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Card title (proportional). */
  title?: React.ReactNode;
  /** Uppercase mono eyebrow above the title. */
  eyebrow?: React.ReactNode;
  /** Right-aligned header actions. */
  actions?: React.ReactNode;
  /** Severity tint as a thin top rule. */
  severity?: "amber" | "red" | "blue" | "green" | null;
  /** Inset (darker) surface for nested wells. */
  inset?: boolean;
  /** Hover affordance for clickable cards. */
  interactive?: boolean;
  /** Remove body padding (for tables / flush lists). */
  flush?: boolean;
  children?: React.ReactNode;
}

/** Surface panel — hairline border, 7px radius, no shadow. */
export function Card(props: CardProps): JSX.Element;
