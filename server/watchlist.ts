// server/watchlist.ts — the deterministic contract-surface watchlist + parser
// (schema §5). No model touches this path.
//
// Casing: this module is in-process and returns camelCase (ClassifyResult.contractId,
// contractType, mechanicalChange). The HTTP/event boundary (registry.ts) maps to
// snake_case explicitly — never spread a ClassifyResult into an event payload.

import type { ContractType, MechanicalChange, Delta } from "./store.ts";

// ---- in-process (camelCase) classify result, schema §5 ----

export type ClassifyResult =
  | { contractRelevant: false }
  | {
      contractRelevant: true;
      contractType: ContractType;
      contractId: string;
      mechanicalChange: MechanicalChange;
    };

// ---- watchlist globs (schema §5) ----
// Path glob -> contract type. Order matters: first match wins.

type WatchRule = { type: ContractType; test: (path: string) => boolean };

const WATCHLIST: WatchRule[] = [
  // db_schema: **/*.prisma, **/schema.sql, **/migrations/**, drizzle schema, **/models/**
  {
    type: "db_schema",
    test: (p) =>
      /\.prisma$/.test(p) ||
      /(^|\/)schema\.sql$/.test(p) ||
      /(^|\/)migrations\//.test(p) ||
      /(^|\/)drizzle(\/|\.)/.test(p) ||
      /(^|\/)models\//.test(p),
  },
  // api_shape: **/routes/**, **/*.controller.ts, **/openapi.*, trpc routers
  {
    type: "api_shape",
    test: (p) =>
      /(^|\/)routes\//.test(p) ||
      /\.controller\.ts$/.test(p) ||
      /(^|\/)openapi\./.test(p) ||
      /(^|\/)trpc\//.test(p) ||
      /router\.ts$/.test(p),
  },
  // dep_version: **/package.json, requirements.txt, go.mod, Cargo.toml (version changes only)
  {
    type: "dep_version",
    test: (p) =>
      /(^|\/)package\.json$/.test(p) ||
      /(^|\/)requirements\.txt$/.test(p) ||
      /(^|\/)go\.mod$/.test(p) ||
      /(^|\/)Cargo\.toml$/.test(p),
  },
  // decision: an append to **/DECISIONS.md (datum decide "..." is routed elsewhere)
  {
    type: "decision",
    test: (p) => /(^|\/)DECISIONS\.md$/.test(p),
  },
];

function matchWatchlist(path: string): ContractType | null {
  for (const rule of WATCHLIST) {
    if (rule.test(path)) return rule.type;
  }
  return null;
}

/**
 * classifyEdit — given a file path and its before/after content, decide whether
 * the edit is contract-relevant and, if so, what mechanical change it carries.
 *
 * The hero is the real rename_column parse on migrations/*.sql + schema.sql
 * (users.email -> contact_email). Other kinds are a light parse.
 */
export function classifyEdit(
  path: string,
  before: string | null,
  after: string,
): ClassifyResult {
  const type = matchWatchlist(path);
  if (!type) return { contractRelevant: false };

  switch (type) {
    case "db_schema":
      return classifyDbSchema(path, before, after);
    case "dep_version":
      return classifyDepVersion(type, before, after);
    case "api_shape":
      return classifyApiShape(path, before, after);
    case "decision":
      return classifyDecision(type, before, after);
  }
}

// ---- db_schema: the real rename_column hero parse ----

function classifyDbSchema(
  path: string,
  before: string | null,
  after: string,
): ClassifyResult {
  const migration = migrationName(path);

  // 1) explicit ALTER TABLE ... RENAME COLUMN old TO new (Postgres/SQLite DDL).
  const renameDdl =
    /ALTER\s+TABLE\s+(?:["'`]?(\w+)["'`]?\.)?["'`]?(\w+)["'`]?\s+RENAME\s+(?:COLUMN\s+)?["'`]?(\w+)["'`]?\s+TO\s+["'`]?(\w+)["'`]?/i.exec(
      after,
    );
  if (renameDdl) {
    const table = renameDdl[2];
    const from = renameDdl[3];
    const to = renameDdl[4];
    return renameColumnResult(table, from, to, migration);
  }

  // 2) diff a CREATE TABLE column set before->after: exactly one column dropped
  //    and one added on the same table => rename. This covers schema.sql edits
  //    that rewrite the column rather than emitting DDL.
  if (before != null) {
    const diff = diffSingleColumnRename(before, after);
    if (diff) {
      return renameColumnResult(diff.table, diff.from, diff.to, migration);
    }
    const added = diffSingleColumnAddDrop(before, after);
    if (added) {
      return {
        contractRelevant: true,
        contractType: "db_schema",
        contractId: tableContractId(added.table),
        mechanicalChange: {
          kind: added.kind,
          table: added.table,
          column: added.column,
          ...(migration ? { migration } : {}),
        },
      };
    }
  }

  // Light fallback: a db-schema file changed but we could not extract a precise
  // column-level change. Still contract-relevant (a schema surface moved); carry
  // a best-effort table id + a decision-style note so downstream can render it.
  const table = firstTableName(after) ?? "users";
  return {
    contractRelevant: true,
    contractType: "db_schema",
    contractId: tableContractId(table),
    mechanicalChange: { kind: "decision", text: `schema change in ${path}` },
  };
}

function renameColumnResult(
  table: string,
  from: string,
  to: string,
  migration: string | undefined,
): ClassifyResult {
  return {
    contractRelevant: true,
    contractType: "db_schema",
    contractId: tableContractId(table),
    mechanicalChange: {
      kind: "rename_column",
      table,
      from,
      to,
      ...(migration ? { migration } : {}),
    },
  };
}

/** "db.users" from a table name. */
function tableContractId(table: string): string {
  return `db.${table}`;
}

/** Extract the migration number from a path like migrations/0042_rename.sql -> "0042". */
function migrationName(path: string): string | undefined {
  const m = /(?:^|\/)(\d{3,})[_-]/.exec(path);
  if (m) return m[1];
  // fall back to the bare basename stem if it looks migration-y
  const base = /(?:^|\/)([^/]+)\.sql$/.exec(path);
  if (base && /migration/i.test(path)) return base[1];
  return undefined;
}

/** First table name referenced by CREATE TABLE / ALTER TABLE in the content. */
function firstTableName(content: string): string | null {
  const m =
    /(?:CREATE\s+TABLE(?:\s+IF\s+NOT\s+EXISTS)?|ALTER\s+TABLE)\s+(?:["'`]?\w+["'`]?\.)?["'`]?(\w+)["'`]?/i.exec(
      content,
    );
  return m ? m[1] : null;
}

/** Column names declared inside the first CREATE TABLE block for `table`. */
function columnsOf(content: string, table: string): Set<string> {
  const cols = new Set<string>();
  // Find CREATE TABLE <table> ( ... ) and read the leading identifier of each line.
  const re = new RegExp(
    `CREATE\\s+TABLE(?:\\s+IF\\s+NOT\\s+EXISTS)?\\s+(?:["'\`]?\\w+["'\`]?\\.)?["'\`]?${table}["'\`]?\\s*\\(([\\s\\S]*?)\\)\\s*;`,
    "i",
  );
  const block = re.exec(content);
  if (!block) return cols;
  const body = block[1];
  for (const rawLine of body.split(/,(?![^(]*\))/)) {
    const line = rawLine.trim();
    if (!line) continue;
    // skip table-level constraints
    if (/^(PRIMARY|FOREIGN|UNIQUE|CONSTRAINT|CHECK|KEY|INDEX)\b/i.test(line)) continue;
    const m = /^["'`]?(\w+)["'`]?/.exec(line);
    if (m) cols.add(m[1]);
  }
  return cols;
}

/** All table names that appear in a CREATE TABLE statement. */
function tableNames(content: string): string[] {
  const names: string[] = [];
  const re =
    /CREATE\s+TABLE(?:\s+IF\s+NOT\s+EXISTS)?\s+(?:["'`]?\w+["'`]?\.)?["'`]?(\w+)["'`]?/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) names.push(m[1]);
  return names;
}

/**
 * Detect a single-column rename by diffing CREATE TABLE column sets between
 * before and after: exactly one column removed and exactly one added on the
 * same table.
 */
function diffSingleColumnRename(
  before: string,
  after: string,
): { table: string; from: string; to: string } | null {
  for (const table of tableNames(after)) {
    const b = columnsOf(before, table);
    const a = columnsOf(after, table);
    if (b.size === 0 || a.size === 0) continue;
    const removed = [...b].filter((c) => !a.has(c));
    const added = [...a].filter((c) => !b.has(c));
    if (removed.length === 1 && added.length === 1) {
      return { table, from: removed[0], to: added[0] };
    }
  }
  return null;
}

/** Detect a pure single add_column / drop_column on a CREATE TABLE diff. */
function diffSingleColumnAddDrop(
  before: string,
  after: string,
): { kind: "add_column" | "drop_column"; table: string; column: string } | null {
  for (const table of tableNames(after)) {
    const b = columnsOf(before, table);
    const a = columnsOf(after, table);
    if (b.size === 0 && a.size === 0) continue;
    const removed = [...b].filter((c) => !a.has(c));
    const added = [...a].filter((c) => !b.has(c));
    if (added.length === 1 && removed.length === 0) {
      return { kind: "add_column", table, column: added[0] };
    }
    if (removed.length === 1 && added.length === 0) {
      return { kind: "drop_column", table, column: removed[0] };
    }
  }
  return null;
}

// ---- dep_version: light parse (version changes only) ----

function classifyDepVersion(
  type: ContractType,
  before: string | null,
  after: string,
): ClassifyResult {
  if (before == null) return { contractRelevant: false };
  const change = diffDepVersion(before, after);
  if (!change) return { contractRelevant: false }; // non-version edits don't bump
  return {
    contractRelevant: true,
    contractType: type,
    contractId: `deps.${change.dep}`,
    mechanicalChange: {
      kind: "dep_version_changed",
      dep: change.dep,
      from: change.from,
      to: change.to,
    },
  };
}

/** Find the first dependency whose pinned version string changed. */
function diffDepVersion(
  before: string,
  after: string,
): { dep: string; from: string; to: string } | null {
  const reBefore = depVersions(before);
  const reAfter = depVersions(after);
  for (const [dep, to] of reAfter) {
    const from = reBefore.get(dep);
    if (from != null && from !== to) return { dep, from, to };
  }
  return null;
}

/** Map of "name" -> "version" for the common manifest formats (light). */
function depVersions(content: string): Map<string, string> {
  const out = new Map<string, string>();
  // package.json style: "name": "^1.2.3"
  const json = /"([\w@/.\-]+)"\s*:\s*"([~^<>=]*[\d][\w.\-+]*)"/g;
  let m: RegExpExecArray | null;
  while ((m = json.exec(content)) !== null) out.set(m[1], m[2]);
  // go.mod / requirements style: name v1.2.3  or  name==1.2.3
  const line = /^\s*([\w@/.\-]+)\s*(?:==|\s+v?)([\d][\w.\-+]*)\s*$/gm;
  while ((m = line.exec(content)) !== null) {
    if (!out.has(m[1])) out.set(m[1], m[2]);
  }
  return out;
}

// ---- api_shape: light parse ----

function classifyApiShape(
  path: string,
  before: string | null,
  after: string,
): ClassifyResult {
  // A routes/controller file is on the api watchlist, but an INTERNAL edit (a
  // handler-body change — e.g. a query adopting a renamed column) is not itself a
  // contract change and must NOT bump the epoch. Only a change to the API SURFACE
  // (a route declaration added, removed, or renamed) is contract-relevant. This is
  // what lets a fenced consumer's corrective edit reconcile WITHOUT spuriously
  // ticking the epoch on the live path.
  const isRouteFile = /(^|\/)routes\//.test(path) || /\.controller\.ts$/.test(path);
  if (isRouteFile && before !== null) {
    const a = routeSet(before);
    const b = routeSet(after);
    const surfaceUnchanged = a.size === b.size && [...b].every((r) => a.has(r));
    if (surfaceUnchanged) return { contractRelevant: false };
  }
  // a new route file, a changed route surface, or an openapi/trpc spec change.
  const route = routeName(path, after);
  return {
    contractRelevant: true,
    contractType: "api_shape",
    contractId: `api.${route}`,
    mechanicalChange: { kind: "decision", text: `api surface change in ${path}` },
  };
}

// the set of `METHOD /path` route declarations in a source file (best-effort).
function routeSet(content: string | null): Set<string> {
  const set = new Set<string>();
  if (!content) return set;
  const re = /\b(get|post|put|patch|delete)\s*\(\s*["'`]([^"'`]+)["'`]/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) set.add(`${m[1].toUpperCase()} ${m[2]}`);
  return set;
}

function routeName(path: string, content: string): string {
  // best-effort: GET /users/:id style from a route definition
  const m = /\b(get|post|put|patch|delete)\s*\(\s*["'`]([^"'`]+)["'`]/i.exec(content);
  if (m) return `${m[1].toUpperCase()} ${m[2]}`;
  return path;
}

// ---- decision ----

function classifyDecision(
  type: ContractType,
  before: string | null,
  after: string,
): ClassifyResult {
  const text = appendedText(before, after) || after.trim().split("\n").pop() || after;
  return {
    contractRelevant: true,
    contractType: type,
    contractId: "decision",
    mechanicalChange: { kind: "decision", text: text.trim() },
  };
}

function appendedText(before: string | null, after: string): string | null {
  if (before != null && after.startsWith(before)) {
    return after.slice(before.length).trim() || null;
  }
  return null;
}

// ===========================================================================
// Pure, exported helpers (track B / fence imports these).
// ===========================================================================

/**
 * bumpRegistry — the monotonic epoch increment. Returns currentEpoch + 1 only
 * when the delta is contract-relevant; otherwise returns currentEpoch unchanged.
 * (schema §1 / §5: monotonic, +1, only on contractRelevant.)
 *
 * Accepts either a Delta or a ClassifyResult-like flag carrier.
 */
export function bumpRegistry(
  currentEpoch: number,
  delta: Delta | { contractRelevant?: boolean } | null | undefined,
): number {
  if (!delta) return currentEpoch;
  // A Delta is always contract-relevant by construction. A ClassifyResult may
  // be off-watchlist.
  if ("contractRelevant" in delta && delta.contractRelevant === false) {
    return currentEpoch;
  }
  return currentEpoch + 1;
}

/**
 * referencesStaleSymbol — does `content` still reference the symbol the change
 * renamed-away or removed, with WORD-BOUNDARY matching so that "contact_email"
 * is NOT matched by "email"? Pure + exported; track B (fence) imports this.
 */
export function referencesStaleSymbol(
  content: string,
  mechanicalChange: MechanicalChange,
): boolean {
  const stale = staleSymbolOf(mechanicalChange);
  if (!stale) return false;
  return wordBoundaryMatch(content, stale);
}

/** The symbol that became stale (renamed-away from / removed), if any. */
function staleSymbolOf(mc: MechanicalChange): string | null {
  switch (mc.kind) {
    case "rename_column":
      return mc.from;
    case "drop_column":
      return mc.column;
    case "api_field_renamed":
    case "api_field_removed":
      return mc.from ?? null;
    default:
      return null; // add_column / dep_version_changed / decision: nothing stale
  }
}

/**
 * Word-boundary containment of `symbol` in `content`. Crucially, an identifier
 * char (\w) on EITHER side disqualifies a match, so searching for "email" does
 * not hit "contact_email". A leading dot (".email") is allowed as a boundary
 * because property access is a distinct token.
 */
function wordBoundaryMatch(content: string, symbol: string): boolean {
  const escaped = symbol.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // (?<![\w]) — no identifier char immediately before; (?![\w]) — none after.
  const re = new RegExp(`(?<![\\w])${escaped}(?![\\w])`);
  return re.test(content);
}
