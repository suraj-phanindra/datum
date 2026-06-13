import React from "react";
declare namespace JSX { interface Element {} }

/**
 * Props for the mono identifier token.
 * @startingPoint section="Core" subtitle="Mono identifier tokens" viewport="700x460"
 */
export interface TagProps extends React.HTMLAttributes<HTMLElement> {
  /** Leading glyph (e.g. a contract / file / branch icon). */
  icon?: React.ReactNode;
  /** Optional trailing version string, e.g. "v8". */
  version?: string | null;
  /** Tint the version amber to mark the live epoch. */
  live?: boolean;
  size?: "sm" | "md";
  /** Render element — "span" (default) or "button" for clickable tokens. */
  as?: "span" | "button" | "a";
  children?: React.ReactNode;
}

/** Monospace identifier token — contract names, file paths, branches, versions. */
export function Tag(props: TagProps): JSX.Element;
