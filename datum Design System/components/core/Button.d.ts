import React from "react";

declare namespace JSX { interface Element {} }

/**
 * Props for the tower action button.
 * @startingPoint section="Core" subtitle="Buttons — all variants & sizes" viewport="700x460"
 */
export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Visual role. `primary` is a high-contrast neutral (amber is reserved for contract state); `danger` is the fence/reject red. */
  variant?: "primary" | "secondary" | "ghost" | "danger";
  /** Control height. */
  size?: "sm" | "md" | "lg";
  /** Render as a square icon button (pass a single icon as children). */
  iconOnly?: boolean;
  /** Icon node placed before the label. */
  leadingIcon?: React.ReactNode;
  /** Icon node placed after the label. */
  trailingIcon?: React.ReactNode;
  disabled?: boolean;
  children?: React.ReactNode;
}

/**
 * Primary action / control button for the tower.
 */
export function Button(props: ButtonProps): JSX.Element;
