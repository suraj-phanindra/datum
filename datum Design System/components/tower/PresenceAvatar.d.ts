import React from "react";
declare namespace JSX { interface Element {} }

/**
 * Props for a single session avatar.
 * @startingPoint section="Tower" subtitle="Session presence — initials, not robots" viewport="700x130"
 */
export interface PresenceAvatarProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** Session initials, e.g. "as" for asha. */
  initials: string;
  /** Full session name for the tooltip. */
  name?: string;
  size?: "sm" | "md" | "lg";
  /** Session is currently building against this surface (amber pulse). */
  active?: boolean;
  /** Add a field-colored ring (for standalone placement). */
  ring?: boolean;
}

export interface Session {
  initials: string;
  name?: string;
  active?: boolean;
}

export interface PresenceStackProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** Sessions parked on a contract/file. */
  sessions: Session[];
  /** Max avatars before collapsing into a +N pill. */
  max?: number;
  size?: "sm" | "md" | "lg";
}

/** A session shown as initials (human + agent as one unit). */
export function PresenceAvatar(props: PresenceAvatarProps): JSX.Element;
/** Overlapping group of sessions parked on a surface. */
export function PresenceStack(props: PresenceStackProps): JSX.Element;
