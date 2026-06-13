// demo/publish-spec-pr.ts — open the REAL GitHub spec PR for the workspace-
// invites scenario. The arbiter's job in production: when db.users v7->v8 lands,
// patch the team repo's docs/spec.md to the new contract truth and open a PR.
// This publishes that artifact for real: build the v7 seed, push it to a public
// GitHub repo (acme/workspaces stand-in), then run openSpecPR(useGh:true).
//
// One-off publishing utility — NOT part of the headless `datum demo` (which uses
// the deterministic local-artifact PR). Run: node demo/publish-spec-pr.ts
import { spawnSync } from "node:child_process";
import { buildWorkspaceRepo, ASHA_RATIONALE } from "./seed.ts";
import { openSpecPR } from "../server/arbiter/spec-pr.ts";
import type { Delta } from "../server/store.ts";

const REPO = process.env.WSI_REPO || "datum-workspace-invites";

function sh(cmd: string, args: string[], cwd?: string) {
  const r = spawnSync(cmd, args, { cwd, encoding: "utf8" });
  return { ok: r.status === 0, out: (r.stdout ?? "").trim(), err: (r.stderr ?? "").trim() };
}

// 1) build the v7 seed (fresh tmp repo, on `main`, docs/spec.md uses users.email).
const repo = buildWorkspaceRepo();
console.log(`seed repo: ${repo.dir} (base ${repo.base})`);

// 2) ensure the public GitHub repo exists (idempotent).
const create = sh("gh", ["repo", "create", REPO, "--public", "--description",
  "acme/workspaces — the team feature repo Datum coordinates (workspace invites). Fixture for the spec-patch PR demo."]);
if (!create.ok && !/already exists|Name already exists/i.test(create.err)) {
  console.error(`gh repo create failed: ${create.err}`);
  process.exit(1);
}
const owner = sh("gh", ["api", "user", "-q", ".login"]).out;
const remote = `https://github.com/${owner}/${REPO}.git`;

// 3) point origin at the GitHub repo + push `main` (the PR base).
sh("git", ["remote", "remove", "origin"], repo.dir); // ignore if absent
sh("git", ["remote", "add", "origin", remote], repo.dir);
const push = sh("git", ["push", "-u", "origin", repo.base], repo.dir);
console.log(`push ${repo.base} -> ${remote}: ${push.ok ? "ok" : push.err}`);

// 4) the hero delta (schema §3) + open the real PR via gh.
const delta = {
  epoch: 8,
  contract_id: "db.users",
  from_version: 7,
  to_version: 8,
  author: "asha",
  ts: "2026-06-13T14:02:11Z",
  why: ASHA_RATIONALE,
  mechanical_change: { kind: "rename_column", table: "users", from: "email", to: "contact_email", migration: "0042" },
} as unknown as Delta;

const pr = await openSpecPR(delta, 112, {
  repoDir: repo.dir,
  specPath: "docs/spec.md",
  useGh: true,
  base: repo.base,
});
console.log("\nspec PR:");
console.log(JSON.stringify(pr, null, 2));
console.log(pr.url.startsWith("http") ? `\n✓ real GitHub PR opened: ${pr.url}` : `\n(local artifact: ${pr.url})`);
