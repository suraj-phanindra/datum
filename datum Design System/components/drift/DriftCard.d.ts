import React from "react";
import { BlastNode } from "./BlastRadius";
import { LifecycleStage } from "../tower/LifecycleChip";
declare namespace JSX { interface Element {} }

export interface DriftQuote {
  /** Originating session, e.g. "asha". */
  who: string;
  /** One-line human reason for the change. */
  text: string;
}

export interface DriftChange {
  /** Old identifier, e.g. "users.email". */
  from: string;
  /** New identifier, e.g. "contact_email". */
  to: string;
  /** Optional migration ref, e.g. "migration 0042". */
  migration?: string;
}

export interface DriftStage {
  stage: LifecycleStage;
  elapsed?: string;
  label?: string;
  pending?: boolean;
}

export interface DriftLink {
  label: string;
  onClick?: () => void;
}

/**
 * Props for the hero drift card.
 * @startingPoint section="Drift" subtitle="The hero drift card — collapsed & expanded" viewport="700x560"
 */
export interface DriftCardProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Contract identifier, e.g. "db.users". */
  contract?: string;
  fromVersion?: string;
  toVersion?: string;
  /** Timestamp, e.g. "14:02". */
  timestamp?: string;
  /** Severity tint. Breaking deltas/fences are red; surface activity is amber. */
  severity?: "amber" | "red";
  /** The why — a one-line quote from the originating session. */
  quote?: DriftQuote | null;
  /** The mechanical change, shown in monospace. */
  change?: DriftChange | null;
  /** Lifecycle chips, in order. */
  lifecycle?: DriftStage[];
  /** Blast-radius nodes (affected sessions/files). */
  nodes?: BlastNode[];
  /** Resolution: spec PR link. */
  pr?: DriftLink | null;
  /** Resolution: ledger entry link. */
  ledger?: DriftLink | null;
  /** Start expanded (live drift) or collapsed (calm feed). */
  defaultOpen?: boolean;
}

/** The hero component: a contract delta as a lifecycle-bearing mini-incident. */
export function DriftCard(props: DriftCardProps): JSX.Element;
