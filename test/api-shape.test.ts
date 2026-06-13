// test/api-shape.test.ts — the api_shape watchlist must distinguish a real API
// SURFACE change (route added/removed/renamed -> bump) from an INTERNAL handler
// edit (a query adopting a renamed column -> NO bump). The latter is exactly
// ben's corrective edit to routes/users.ts; it must reconcile WITHOUT ticking
// the epoch past the hero v8 on the live wired path.
import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyEdit } from "../server/watchlist.ts";

const BEN_BEFORE = `import { router } from "./_router.ts";
router.get("/users/:id", async (req, res) => {
  const u = await db.query("select id, email from users where id = $1", [req.params.id]);
  res.json({ id: u.id, email: u.email });
});`;

// ben's self-correction: same route surface, body adopts contact_email.
const BEN_AFTER = `import { router } from "./_router.ts";
router.get("/users/:id", async (req, res) => {
  const u = await db.query("select id, contact_email from users where id = $1", [req.params.id]);
  res.json({ id: u.id, contact_email: u.contact_email });
});`;

test("api_shape: an internal handler edit (route surface unchanged) is NOT contract-relevant -> no bump", () => {
  const r = classifyEdit("routes/users.ts", BEN_BEFORE, BEN_AFTER);
  assert.equal(r.contractRelevant, false, "ben's column-fix in a handler body must not bump the epoch");
});

test("api_shape: adding a route declaration IS a surface change -> contract-relevant", () => {
  const after = BEN_BEFORE + `\nrouter.post("/users", async (req, res) => { res.status(201).end(); });`;
  const r = classifyEdit("routes/users.ts", BEN_BEFORE, after);
  assert.equal(r.contractRelevant, true, "a new route declaration is an API surface change");
});

test("api_shape: renaming a route path IS a surface change -> contract-relevant", () => {
  const after = BEN_BEFORE.replace("/users/:id", "/members/:id");
  const r = classifyEdit("routes/users.ts", BEN_BEFORE, after);
  assert.equal(r.contractRelevant, true, "a renamed route path is an API surface change");
});

test("api_shape: a brand-new routes file (no before) is contract-relevant", () => {
  const r = classifyEdit("routes/invites.ts", null, `router.post("/invites", async (req, res) => { res.status(202).end(); });`);
  assert.equal(r.contractRelevant, true, "a new route surface is contract-relevant");
});
