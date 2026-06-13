// server/store.ts — typed, synchronous CRUD over the SQLite store.
//
// Casing (schema §5): rows on disk use the snake_case field names from §2 (so a
// row maps 1:1 to the wire/event shape). In-process the store returns those same
// shapes verbatim — they ARE the §2 types, which are defined snake_case in the
// frozen schema. The camelCase boundary lives in watchlist/registry where the
// ClassifyResult/MechanicalChange in-process objects are camelCase and mapped to
// snake_case event payloads explicitly.

import type { Database } from "./db.ts";

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

export type Session = {
  id: string;
  human: string;
  branch: string;
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
  private db: Database;

  constructor(db: Database) {
    this.db = db;
  }

  // ---- registry version (global epoch) ----

  getVersion(): number {
    const row = this.db
      .prepare("SELECT value FROM meta WHERE key = 'registry_version'")
      .get() as { value: string } | undefined;
    return row ? Number(row.value) : 0;
  }

  setVersion(epoch: number): void {
    this.db
      .prepare(
        "INSERT INTO meta (key, value) VALUES ('registry_version', ?) " +
          "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      )
      .run(String(epoch));
  }

  // ---- contracts ----

  upsertContract(c: Contract): void {
    this.db
      .prepare(
        "INSERT INTO contracts (id, name, type, current_version, current_value) " +
          "VALUES (?, ?, ?, ?, ?) " +
          "ON CONFLICT(id) DO UPDATE SET name=excluded.name, type=excluded.type, " +
          "current_version=excluded.current_version, current_value=excluded.current_value",
      )
      .run(c.id, c.name, c.type, c.current_version, c.current_value);
  }

  getContract(id: string): Contract | undefined {
    const row = this.db
      .prepare("SELECT * FROM contracts WHERE id = ?")
      .get(id) as Contract | undefined;
    return row;
  }

  listContracts(): Contract[] {
    return this.db
      .prepare("SELECT * FROM contracts ORDER BY id")
      .all() as Contract[];
  }

  // ---- contract_versions ----

  addContractVersion(cv: ContractVersion): void {
    this.db
      .prepare(
        "INSERT INTO contract_versions " +
          "(contract_id, version, epoch, author, ts, why, mechanical_change, value_snapshot) " +
          "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .run(
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
      .prepare(
        "SELECT * FROM contract_versions WHERE contract_id = ? ORDER BY version",
      )
      .all(contractId) as Array<Omit<ContractVersion, "mechanical_change"> & { mechanical_change: string }>;
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
      this.db
        .prepare(
          "INSERT INTO ledger (id, ts, author, description, contract_id) VALUES (?, ?, ?, ?, ?)",
        )
        .run(entry.id, entry.ts, entry.author, entry.description, entry.contract_id ?? null);
      return entry.id;
    }
    // Compute next id as max(existing)+1 (>=1) so it survives explicit seeding.
    const maxRow = this.db
      .prepare("SELECT COALESCE(MAX(id), 0) AS m FROM ledger")
      .get() as { m: number };
    const nextId = Math.max(maxRow.m + 1, 1);
    this.db
      .prepare(
        "INSERT INTO ledger (id, ts, author, description, contract_id) VALUES (?, ?, ?, ?, ?)",
      )
      .run(nextId, entry.ts, entry.author, entry.description, entry.contract_id ?? null);
    return nextId;
  }

  getLedger(id: number): LedgerEntry | undefined {
    const row = this.db.prepare("SELECT * FROM ledger WHERE id = ?").get(id) as
      | (LedgerEntry & { contract_id: string | null })
      | undefined;
    if (!row) return undefined;
    return { ...row, contract_id: row.contract_id ?? undefined };
  }

  listLedger(): LedgerEntry[] {
    const rows = this.db
      .prepare("SELECT * FROM ledger ORDER BY id DESC")
      .all() as Array<LedgerEntry & { contract_id: string | null }>;
    return rows.map((r) => ({ ...r, contract_id: r.contract_id ?? undefined }));
  }

  // ---- sessions ----

  upsertSession(s: Session): void {
    this.db
      .prepare(
        "INSERT INTO sessions " +
          "(id, human, branch, claim_files, claim_symbols, last_synced_version, status) " +
          "VALUES (?, ?, ?, ?, ?, ?, ?) " +
          "ON CONFLICT(id) DO UPDATE SET human=excluded.human, branch=excluded.branch, " +
          "claim_files=excluded.claim_files, claim_symbols=excluded.claim_symbols, " +
          "last_synced_version=excluded.last_synced_version, status=excluded.status",
      )
      .run(
        s.id,
        s.human,
        s.branch,
        JSON.stringify(s.claim_files),
        JSON.stringify(s.claim_symbols),
        s.last_synced_version,
        s.status,
      );
  }

  getSession(id: string): Session | undefined {
    const row = this.db.prepare("SELECT * FROM sessions WHERE id = ?").get(id) as
      | RawSession
      | undefined;
    return row ? hydrateSession(row) : undefined;
  }

  listSessions(): Session[] {
    const rows = this.db
      .prepare("SELECT * FROM sessions ORDER BY id")
      .all() as RawSession[];
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
    const info = this.db
      .prepare("INSERT INTO events (type, payload, ts) VALUES (?, ?, ?)")
      .run(type, JSON.stringify(payload), ts);
    return {
      id: Number(info.lastInsertRowid),
      type,
      payload,
      ts,
    };
  }

  getEventsSince(id: number): Event[] {
    const rows = this.db
      .prepare("SELECT * FROM events WHERE id > ? ORDER BY id")
      .all(id) as RawEvent[];
    return rows.map(hydrateEvent);
  }

  /** Deltas with epoch > version (schema §4 GET /deltas?since=N). */
  getDeltasSince(version: number): Delta[] {
    const rows = this.db
      .prepare(
        "SELECT payload FROM events WHERE type = 'delta.detected' ORDER BY id",
      )
      .all() as Array<{ payload: string }>;
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
};

function hydrateSession(r: RawSession): Session {
  return {
    id: r.id,
    human: r.human,
    branch: r.branch,
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
