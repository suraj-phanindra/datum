import { test } from "node:test";
import assert from "node:assert/strict";

import { bumpRegistry, classifyEdit } from "../server/watchlist.ts";
import type { Delta } from "../server/store.ts";

const DELTA: Delta = {
  epoch: 8,
  contract_id: "db.users",
  from_version: 7,
  to_version: 8,
  author: "asha",
  ts: "2026-06-13T14:02:11Z",
  why: "phone signups make email the wrong name.",
  mechanical_change: {
    kind: "rename_column",
    table: "users",
    from: "email",
    to: "contact_email",
    migration: "0042",
  },
};

test("bumpRegistry(7, delta) === 8 (monotonic +1 on a contract-relevant delta)", () => {
  assert.equal(bumpRegistry(7, DELTA), 8);
});

test("bumpRegistry: off-watchlist classify result leaves the epoch unchanged", () => {
  const offWatchlist = classifyEdit("README.md", null, "docs");
  assert.equal(offWatchlist.contractRelevant, false);
  assert.equal(bumpRegistry(7, offWatchlist), 7);
});

test("bumpRegistry: null/undefined delta does not bump", () => {
  assert.equal(bumpRegistry(7, null), 7);
  assert.equal(bumpRegistry(7, undefined), 7);
});

test("bumpRegistry: a contract-relevant classify result bumps", () => {
  const relevant = classifyEdit(
    "migrations/0042_rename.sql",
    null,
    "ALTER TABLE users RENAME COLUMN email TO contact_email;",
  );
  assert.equal(relevant.contractRelevant, true);
  assert.equal(bumpRegistry(7, relevant), 8);
});
