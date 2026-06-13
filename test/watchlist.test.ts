import { test } from "node:test";
import assert from "node:assert/strict";

import { classifyEdit, referencesStaleSymbol } from "../server/watchlist.ts";
import type { MechanicalChange } from "../server/store.ts";

const RENAME_DDL = `-- migration 0042: rename users.email
ALTER TABLE users RENAME COLUMN email TO contact_email;
`;

test("classifyEdit: migrations/0042_rename.sql -> contractRelevant true, db.users rename_column", () => {
  const result = classifyEdit("migrations/0042_rename.sql", null, RENAME_DDL);
  assert.equal(result.contractRelevant, true);
  if (!result.contractRelevant) return; // narrow
  assert.equal(result.contractId, "db.users");
  assert.equal(result.contractType, "db_schema");
  assert.equal(result.mechanicalChange.kind, "rename_column");
  const mc = result.mechanicalChange;
  assert.equal(mc.kind, "rename_column");
  if (mc.kind !== "rename_column") return;
  assert.equal(mc.table, "users");
  assert.equal(mc.from, "email");
  assert.equal(mc.to, "contact_email");
  assert.equal(mc.migration, "0042");
});

test("classifyEdit: schema.sql CREATE TABLE rewrite detects the rename via column diff", () => {
  const before = `CREATE TABLE users (\n  id INTEGER PRIMARY KEY,\n  email TEXT,\n  name TEXT\n);`;
  const after = `CREATE TABLE users (\n  id INTEGER PRIMARY KEY,\n  contact_email TEXT,\n  name TEXT\n);`;
  const result = classifyEdit("schema.sql", before, after);
  assert.equal(result.contractRelevant, true);
  if (!result.contractRelevant) return;
  assert.equal(result.contractId, "db.users");
  const mc = result.mechanicalChange;
  assert.equal(mc.kind, "rename_column");
  if (mc.kind !== "rename_column") return;
  assert.equal(mc.from, "email");
  assert.equal(mc.to, "contact_email");
});

test("classifyEdit: README.md -> contractRelevant false (off-watchlist)", () => {
  const result = classifyEdit("README.md", "old", "new readme content");
  assert.equal(result.contractRelevant, false);
});

test("classifyEdit: *.test.ts -> contractRelevant false (off-watchlist)", () => {
  const result = classifyEdit("server/foo.test.ts", null, "describe('x', ...)");
  assert.equal(result.contractRelevant, false);
});

test("referencesStaleSymbol: word-boundary match (.email hits, contact_email does not)", () => {
  const change: MechanicalChange = {
    kind: "rename_column",
    table: "users",
    from: "email",
    to: "contact_email",
    migration: "0042",
  };
  assert.equal(referencesStaleSymbol("select .email from users", change), true);
  assert.equal(referencesStaleSymbol("select contact_email from users", change), false);
  // 'contact_email' must NOT be matched by the stale 'email'
  assert.equal(referencesStaleSymbol("const x = user.contact_email;", change), false);
  // a clean rewrite that only uses the new symbol
  assert.equal(referencesStaleSymbol("return row.contact_email;", change), false);
});
