// server/store.ts — typed, synchronous CRUD over the SQLite store.
//
// Casing (schema §5): rows on disk use the snake_case field names from §2 (so a
// row maps 1:1 to the wire/event shape). In-process the store returns those same
// shapes verbatim — they ARE the §2 types, which are defined snake_case in the
// frozen schema. The camelCase boundary lives in watchlist/registry where the
// ClassifyResult/MechanicalChange in-process objects are camelCase and mapped to
// snake_case event payloads explicitly.

import type { SqlBackend } from "./sql-backend.ts";

// ---- §2 data model types (snake_case, verbatim from schema.md) ----

export type ContractType = "db_schema" | "api_shape" | "dep_version" | "decision";

export type Contract = {
  id: string;
  name: string;
  type: ContractType;
  current_version: number;
  current_value: string; // JSON snapshot
};

export type ContractVersion = {
  contract_id: string;
  version: number;
  epoch: number;
  author: string;
  ts: string;
  why: string;
  mechanical_change: MechanicalChange;
  value_snapshot: string;
};

export type LedgerEntry = {
  id: number;
  ts: string;
  author: string;
  description: string;
  contract_id?: string;
};

export type SessionStatus = "live" | "fenced" | "reconciling" | "reconciled" | "idle";

// §2 + §10. workspace_id + email are the additive team fields (default "" so old
// rows + old callers stay valid).
export type Session = {
  id: string;
  human: string;
  email: string;
  branch: string;
  workspace_id: string;
  claim_files: string[];
  claim_symbols: string[];
  last_synced_version: number;
  status: SessionStatus;
};

export type EventType =
  | "session.joined"
  | "claim.published"
  | "edit.streamed"
  | "delta.detected"
  | "write.fenced"
  | "advisory.delivered"
  | "reconciled"
  | "spec.pr.opened";

export type Event = {
  id: number;
  type: EventType;
  payload: Record<string, unknown>;
  ts: string;
};

// ---- §5 mechanical change (in-process camelCase pieces map to snake_case here) ----

export type MechanicalChange =
  | { kind: "rename_column"; table: string; from: string; to: string; migration?: string }
  | { kind: "add_column" | "drop_column"; table: string; column: string; migration?: string }
  | { kind: "api_field_renamed" | "api_field_removed"; route: string; from?: string; to?: string }
  | { kind: "dep_version_changed"; dep: string; from: string; to: string }
  | { kind: "decision"; text: string };

// Delta = the delta.detected payload (schema §4: Delta = delta.detected payload).
export type Delta = {
  epoch: number;
  contract_id: string;
  from_version: number;
  to_version: number;
  author: string;
  ts: string;
  why: string;
  mechanical_change: MechanicalChange;
};

// ---- Store ----

export class Store {
  private db: SqlBackend;

  constructor(db: SqlBackend) {
    this.db = db;
  }

  // ---- registry version (global epoch) ----

  getVersion(): number {
    const row = (this.db
      .all("SELECT value FROM meta WHERE key = 'registry_version'")[0] ?? undefined) as
      | { value: string }
      | undefined;
    return row ? Number(row.value) : 0;
  }

  setVersion(epoch: number): void {
    this.db.run(
      "INSERT INTO meta (key, value) VALUES ('registry_version', ?) " +
        "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      String(epoch),
    );
  }

  // ---- workspace (§10): the bus is single-registry per team. It adopts the
  // FIRST workspace_id it sees and warns sessions that join with a different one.

  /** The workspace this bus serves, or "" if no session has named one yet. */
  getWorkspace(): string {
    const row = (this.db
      .all("SELECT value FROM meta WHERE key = 'workspace_id'")[0] ?? undefined) as
      | { value: string }
      | undefined;
    return row ? row.value : "";
  }

  /**
   * Adopt `workspace_id` as this bus's workspace IFF none is set yet (the first
   * join wins). A blank id is ignored (fail-open for pre-team callers). Returns
   * the workspace the bus serves after the call.
   */
  adoptWorkspace(workspaceId: string): string {
    const id = (workspaceId ?? "").trim();
    if (!id) return this.getWorkspace();
    const current = this.getWorkspace();
    if (current) return current;
    this.db.run(
      "INSERT INTO meta (key, value) VALUES ('workspace_id', ?) " +
        "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      id,
    );
    return id;
  }

  // ---- contracts ----

  upsertContract(c: Contract): void {
    this.db.run(
      "INSERT INTO contracts (id, name, type, current_version, current_value) " +
        "VALUES (?, ?, ?, ?, ?) " +
        "ON CONFLICT(id) DO UPDATE SET name=excluded.name, type=excluded.type, " +
        "current_version=excluded.current_version, current_value=excluded.current_value",
      c.id,
      c.name,
      c.type,
      c.current_version,
      c.current_value,
    );
  }

  getContract(id: string): Contract | undefined {
    const row = (this.db
      .all("SELECT * FROM contracts WHERE id = ?", id)[0] ?? undefined) as
      | Contract
      | undefined;
    return row;
  }

  listContracts(): Contract[] {
    return this.db
      .all("SELECT * FROM contracts ORDER BY id") as Contract[];
  }

  // ---- contract_versions ----

  addContractVersion(cv: ContractVersion): void {
    this.db.run(
      "INSERT INTO contract_versions " +
        "(contract_id, version, epoch, author, ts, why, mechanical_change, value_snapshot) " +
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      cv.contract_id,
      cv.version,
      cv.epoch,
      cv.author,
      cv.ts,
      cv.why,
      JSON.stringify(cv.mechanical_change),
      cv.value_snapshot,
    );
  }

  listContractVersions(contractId: string): ContractVersion[] {
    const rows = this.db
      .all(
        "SELECT * FROM contract_versions WHERE contract_id = ? ORDER BY version",
        contractId,
      ) as Array<Omit<ContractVersion, "mechanical_change"> & { mechanical_change: string }>;
    return rows.map((r) => ({
      ...r,
      mechanical_change: JSON.parse(r.mechanical_change) as MechanicalChange,
    }));
  }

  // ---- ledger ----

  /**
   * Append a ledger entry. If `entry.id` is supplied it is inserted explicitly
   * (used to seed #110/#111 so the next auto id is 112); otherwise the next
   * auto-increment id is assigned. Returns the id.
   */
  addLedger(entry: { id?: number; ts: string; author: string; description: string; contract_id?: string }): number {
    if (entry.id != null) {
      this.db.run(
        "INSERT INTO ledger (id, ts, author, description, contract_id) VALUES (?, ?, ?, ?, ?)",
        entry.id,
        entry.ts,
        entry.author,
        entry.description,
        entry.contract_id ?? null,
      );
      return entry.id;
    }
    // Compute next id as max(existing)+1 (>=1) so it survives explicit seeding.
    const maxRow = (this.db
      .all("SELECT COALESCE(MAX(id), 0) AS m FROM ledger")[0] ?? undefined) as { m: number };
    const nextId = Math.max(maxRow.m + 1, 1);
    this.db.run(
      "INSERT INTO ledger (id, ts, author, description, contract_id) VALUES (?, ?, ?, ?, ?)",
      nextId,
      entry.ts,
      entry.author,
      entry.description,
      entry.contract_id ?? null,
    );
    return nextId;
  }

  getLedger(id: number): LedgerEntry | undefined {
    const row = (this.db.all("SELECT * FROM ledger WHERE id = ?", id)[0] ?? undefined) as
      | (LedgerEntry & { contract_id: string | null })
      | undefined;
    if (!row) return undefined;
    return { ...row, contract_id: row.contract_id ?? undefined };
  }

  listLedger(): LedgerEntry[] {
    const rows = this.db
      .all("SELECT * FROM ledger ORDER BY id DESC") as Array<LedgerEntry & { contract_id: string | null }>;
    return rows.map((r) => ({ ...r, contract_id: r.contract_id ?? undefined }));
  }

  // ---- sessions ----

  upsertSession(s: Session): void {
    this.db.run(
      "INSERT INTO sessions " +
        "(id, human, branch, claim_files, claim_symbols, last_synced_version, status, workspace_id, email) " +
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) " +
        "ON CONFLICT(id) DO UPDATE SET human=excluded.human, branch=excluded.branch, " +
        "claim_files=excluded.claim_files, claim_symbols=excluded.claim_symbols, " +
        "last_synced_version=excluded.last_synced_version, status=excluded.status, " +
        "workspace_id=excluded.workspace_id, email=excluded.email",
      s.id,
      s.human,
      s.branch,
      JSON.stringify(s.claim_files),
      JSON.stringify(s.claim_symbols),
      s.last_synced_version,
      s.status,
      s.workspace_id ?? "",
      s.email ?? "",
    );
  }

  getSession(id: string): Session | undefined {
    const row = (this.db.all("SELECT * FROM sessions WHERE id = ?", id)[0] ?? undefined) as
      | RawSession
      | undefined;
    return row ? hydrateSession(row) : undefined;
  }

  listSessions(): Session[] {
    const rows = this.db
      .all("SELECT * FROM sessions ORDER BY id") as RawSession[];
    return rows.map(hydrateSession);
  }

  /**
   * Patch a session in place. Supports advancing last_synced_version (the
   * re-sync write-back from datum-claim), claim updates, and status changes.
   * Returns the updated session (or undefined if it does not exist).
   */
  patchSession(
    id: string,
    patch: Partial<Omit<Session, "id">>,
  ): Session | undefined {
    const existing = this.getSession(id);
    if (!existing) return undefined;
    const next: Session = {
      ...existing,
      ...patch,
      // never allow id mutation
      id: existing.id,
    };
    this.upsertSession(next);
    return next;
  }

  // ---- events ----

  addEvent(type: EventType, payload: Record<string, unknown>): Event {
    const ts = new Date().toISOString();
    this.db.run(
      "INSERT INTO events (type, payload, ts) VALUES (?, ?, ?)",
      type,
      JSON.stringify(payload),
      ts,
    );
    const row = (this.db
      .all("SELECT last_insert_rowid() AS id")[0] ?? undefined) as { id: number };
    return {
      id: Number(row.id),
      type,
      payload,
      ts,
    };
  }

  getEventsSince(id: number): Event[] {
    const rows = this.db
      .all("SELECT * FROM events WHERE id > ? ORDER BY id", id) as RawEvent[];
    return rows.map(hydrateEvent);
  }

  /** Deltas with epoch > version (schema §4 GET /deltas?since=N). */
  getDeltasSince(version: number): Delta[] {
    const rows = this.db
      .all(
        "SELECT payload FROM events WHERE type = 'delta.detected' ORDER BY id",
      ) as Array<{ payload: string }>;
    return rows
      .map((r) => JSON.parse(r.payload) as Delta)
      .filter((d) => d.epoch > version);
  }
}

// ---- internal row hydration ----

type RawSession = {
  id: string;
  human: string;
  branch: string;
  claim_files: string;
  claim_symbols: string;
  last_synced_version: number;
  status: SessionStatus;
  workspace_id?: string;
  email?: string;
};

function hydrateSession(r: RawSession): Session {
  return {
    id: r.id,
    human: r.human,
    email: r.email ?? "",
    branch: r.branch,
    workspace_id: r.workspace_id ?? "",
    claim_files: JSON.parse(r.claim_files) as string[],
    claim_symbols: JSON.parse(r.claim_symbols) as string[],
    last_synced_version: r.last_synced_version,
    status: r.status,
  };
}

type RawEvent = { id: number; type: EventType; payload: string; ts: string };

function hydrateEvent(r: RawEvent): Event {
  return {
    id: r.id,
    type: r.type,
    payload: JSON.parse(r.payload) as Record<string, unknown>,
    ts: r.ts,
  };
}
