import React from "react";
declare namespace JSX { interface Element {} }

/**
 * Props for a ledger entry.
 * @startingPoint section="Tower" subtitle="Append-only decision history rows" viewport="700x160"
 */
export interface LedgerEntryProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Entry number, e.g. 112 (rendered as #112). */
  id?: number | string;
  /** Timestamp, e.g. "14:02". */
  time?: string;
  /** Author session, e.g. "asha". */
  who?: string;
  /** One-line summary; may contain a <span className="amber"> for the contract. */
  summary?: React.ReactNode;
  /** Emphasize as the newest entry. */
  head?: boolean;
  interactive?: boolean;
}

/** One append-only line in the decision ledger. */
export function LedgerEntry(props: LedgerEntryProps): JSX.Element;
