import React from "react";
declare namespace JSX { interface Element {} }

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  /** Field label. */
  label?: React.ReactNode;
  /** Helper text below the field. */
  hint?: React.ReactNode;
  /** Leading adornment (icon / sigil). */
  prefix?: React.ReactNode;
  /** Trailing adornment. */
  suffix?: React.ReactNode;
  /** Monospace input — for identifiers (paths, contracts, versions). */
  mono?: boolean;
  /** Error state. */
  invalid?: boolean;
}

/** Single-line text field. */
export function Input(props: InputProps): JSX.Element;
