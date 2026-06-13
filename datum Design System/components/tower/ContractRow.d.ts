import React from "react";
import { Session } from "./PresenceAvatar";
declare namespace JSX { interface Element {} }

/**
 * Props for a registry contract row.
 * @startingPoint section="Tower" subtitle="Registry row with presence & version" viewport="700x180"
 */
export interface ContractRowProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Contract identifier, e.g. "db.users" or "api.GET /users/:id". */
  name: string;
  /** Version label, e.g. "v8". */
  version: string;
  /** Tint the version amber (the live epoch). */
  live?: boolean;
  /** Show a drift marker dot. */
  drift?: boolean;
  /** Sessions currently building against this contract. */
  sessions?: Session[];
  /** Hover affordance. */
  interactive?: boolean;
}

/** One line in the current-truth registry. */
export function ContractRow(props: ContractRowProps): JSX.Element;
