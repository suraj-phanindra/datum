// demo/seed.ts — build the workspace-invites fixture: a REAL git repo on disk
// that the headless demo merges and that openSpecPR patches.
//
// On `main` the repo is the v7 truth: users.email everywhere. Three branches
// each reconcile onto contact_email on DISJOINT files so they merge clean:
//   - asha/schema : migrations/0042_rename_users_email.sql (+ schema.sql rewrite)
//   - ben/api     : routes/users.ts email -> contact_email
//   - chen/ui     : UserCard.tsx email -> contact_email
//
// The migration file's FIRST line carries asha's rationale verbatim so the live
// "why" is honest (schema §9 / demo PRD): "phone signups make email the wrong name".
//
// buildWorkspaceRepo() is IDEMPOTENT: it rm's + recreates the repo dir, then
// returns the repo path + the branch names. Node built-ins only (node:child_process
// git, node:fs). No model touches this path.

import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync, rmSync, mkdtempSync, realpathSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));

/**
 * Default location of the seed repo. A fresh dir UNDER os.tmpdir(), NOT inside
 * the datum repo: building a nested git repo inside the parent is a hazard — if
 * concurrent demo runs `rm` the dir mid-`checkout`, git walks up to the PARENT
 * .git and creates the seed's branches there (it once moved this repo's HEAD).
 * A unique tmp dir per build eliminates both the nesting and the collision.
 */
export const WORKSPACE_REPO_DIR = join(HERE, "workspace-invites"); // legacy/back-compat; not the default
function freshRepoDir(): string {
  return mkdtempSync(join(tmpdir(), "datum-wsi-"));
}

export type WorkspaceRepo = {
  /** Absolute path to the git repo. */
  dir: string;
  /** Base branch holding the v7 truth (users.email). */
  base: string;
  /** The three reconciling branches (disjoint files -> merge clean). */
  branches: { asha: string; ben: string; chen: string };
  /** asha's migration file content (its first line carries the why). */
  migrationFile: string;
};

// asha's rationale — the first comment line of the migration (schema §9 why).
export const ASHA_RATIONALE = "phone signups make email the wrong name";

// ---- file contents on `main` (the v7 truth: email everywhere) ----

const SCHEMA_SQL_V7 = `CREATE TABLE users (
  id INTEGER PRIMARY KEY,
  email TEXT NOT NULL,
  name TEXT NOT NULL
);
`;

const ROUTES_USERS_V7 = `import { db } from "../db.ts";

export async function getUser(id: number) {
  const row = await db.query("SELECT id, email, name FROM users WHERE id = ?", [id]);
  return { id: row.id, email: row.email, name: row.name };
}

export async function listUserEmails() {
  const rows = await db.query("SELECT email FROM users");
  return rows.map((r) => r.email);
}
`;

const USERCARD_TSX_V7 = `export function UserCard({ user }: { user: UserDTO }) {
  return (
    <div className="user-card">
      <span className="name">{user.name}</span>
      <span className="email">{user.email}</span>
    </div>
  );
}
`;

const SPEC_MD_V7 = `# Spec — workspace invites

## db.users

The users table has columns id, users.email, and name.
The API route GET /users/:id selects users.email when rendering a user.
The frontend UserCard reads user.email at line 18 and displays it.

## Contract

- db.users: { id, email, name } (v7)
- api.GET /users/:id: returns { id, email, name }
`;

// ---- per-branch rewritten contents (email -> contact_email) ----

const SCHEMA_SQL_V8 = SCHEMA_SQL_V7.replace(/\bemail\b/g, "contact_email");

const ROUTES_USERS_V8 = ROUTES_USERS_V7.replace(/\bemail\b/g, "contact_email");

const USERCARD_TSX_V8 = USERCARD_TSX_V7.replace(/\bemail\b/g, "contact_email");

/** asha's migration file content. FIRST line = the honest rationale comment. */
function migrationContent(): string {
  return (
    `-- ${ASHA_RATIONALE}\n` +
    `-- migration 0042: rename users.email -> contact_email\n` +
    `ALTER TABLE users RENAME COLUMN email TO contact_email;\n`
  );
}

// ---- git plumbing ----

function git(dir: string, args: string[]): { ok: boolean; out: string; err: string } {
  const r = spawnSync("git", args, { cwd: dir, encoding: "utf8" });
  return { ok: r.status === 0, out: (r.stdout ?? "").trim(), err: (r.stderr ?? "").trim() };
}

function gitMust(dir: string, args: string[]): void {
  const r = git(dir, args);
  if (!r.ok) throw new Error(`git ${args.join(" ")} failed: ${r.err || r.out}`);
}

function commitAll(dir: string, message: string): void {
  gitMust(dir, ["add", "-A"]);
  gitMust(dir, [
    "-c",
    "user.email=datum@local",
    "-c",
    "user.name=datum-seed",
    "commit",
    "-q",
    "-m",
    message,
  ]);
}

/**
 * Build (or rebuild) the workspace-invites git repo idempotently.
 *
 * Layout after build:
 *   main: schema.sql (email), routes/users.ts (.email), UserCard.tsx (.email),
 *         docs/spec.md (users.email), migrations/ (empty placeholder)
 *   asha/schema: + migrations/0042_rename_users_email.sql, schema.sql rewritten
 *   ben/api:     routes/users.ts rewritten to contact_email
 *   chen/ui:     UserCard.tsx rewritten to contact_email
 *
 * The three branches touch DISJOINT files so a later `git merge` of all three
 * onto a fresh integration branch is conflict-free (demo PRD predicate #6).
 */
export function buildWorkspaceRepo(dir: string = freshRepoDir()): WorkspaceRepo {
  const migrationFile = migrationContent();
  const base = "main";
  const branches = { asha: "asha/schema", ben: "ben/api", chen: "chen/ui" };

  // idempotent: blow away any prior repo and recreate from scratch.
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });

  gitMust(dir, ["init", "-q"]);
  // SAFETY: confirm git resolved to THIS dir's repo, never a parent repo. If the
  // seed dir were nested inside a git repo (e.g. datum's own .git) and init were
  // skipped or raced, the checkouts below would create branches in the PARENT and
  // move its HEAD. Refuse to proceed unless the git-dir is inside `dir`.
  const gd = git(dir, ["rev-parse", "--absolute-git-dir"]);
  // realpath both sides: git resolves symlinks (macOS /var -> /private/var), so a
  // raw resolve()+startsWith would false-positive the hazard on an os.tmpdir() path.
  const real = realpathSync(dir);
  if (!gd.ok || !resolve(gd.out).startsWith(real)) {
    throw new Error(
      `seed: refusing to operate — git-dir "${gd.out}" is not inside "${real}" (nested-repo hazard).`,
    );
  }
  gitMust(dir, ["checkout", "-q", "-B", base]);

  // ---- main: the v7 truth (email everywhere) ----
  mkdirSync(join(dir, "routes"), { recursive: true });
  mkdirSync(join(dir, "docs"), { recursive: true });
  mkdirSync(join(dir, "migrations"), { recursive: true });

  writeFileSync(join(dir, "schema.sql"), SCHEMA_SQL_V7);
  writeFileSync(join(dir, "routes", "users.ts"), ROUTES_USERS_V7);
  writeFileSync(join(dir, "UserCard.tsx"), USERCARD_TSX_V7);
  writeFileSync(join(dir, "docs", "spec.md"), SPEC_MD_V7);
  // keep migrations/ tracked even though it's empty on main.
  writeFileSync(join(dir, "migrations", ".gitkeep"), "");

  commitAll(dir, "seed: workspace-invites v7 (users.email)");

  // ---- asha/schema: adds the migration + rewrites schema.sql ----
  gitMust(dir, ["checkout", "-q", "-B", branches.asha, base]);
  writeFileSync(join(dir, "migrations", "0042_rename_users_email.sql"), migrationFile);
  writeFileSync(join(dir, "schema.sql"), SCHEMA_SQL_V8);
  commitAll(dir, "asha/schema: rename users.email -> contact_email (migration 0042)");

  // ---- ben/api: rewrites routes/users.ts only ----
  gitMust(dir, ["checkout", "-q", "-B", branches.ben, base]);
  writeFileSync(join(dir, "routes", "users.ts"), ROUTES_USERS_V8);
  commitAll(dir, "ben/api: select contact_email in routes/users.ts");

  // ---- chen/ui: rewrites UserCard.tsx only ----
  gitMust(dir, ["checkout", "-q", "-B", branches.chen, base]);
  writeFileSync(join(dir, "UserCard.tsx"), USERCARD_TSX_V8);
  commitAll(dir, "chen/ui: read user.contact_email in UserCard.tsx");

  // leave the repo on the base branch.
  gitMust(dir, ["checkout", "-q", base]);

  return { dir, base, branches, migrationFile };
}
