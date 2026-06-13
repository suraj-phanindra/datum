import { test } from "node:test";
import assert from "node:assert/strict";

// Scaffold smoke test: proves `npm test` runs TypeScript via Node's native
// type-stripping from an empty repo, with zero install step. Real suites
// (watchlist parser, version bump, fence set-intersection, advisory shape)
// land alongside their features per RUBRIC.md.
test("scaffold: npm test runs TypeScript natively", () => {
  const version: number = 7;
  assert.equal(version + 1, 8, "monotonic bump sanity");
});
