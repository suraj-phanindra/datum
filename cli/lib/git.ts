// cli/lib/git.ts — git-native identity + workspace derivation (schema §10).
//
// The team is the REPO. There is no login and no member list: membership = having
// the repo (git's own model), and identity derives from git config. This module
// is the single source for those derivations:
//
//   - deriveWorkspaceId(cwd): the team key. `git remote get-url origin` normalized
//     to host/owner/repo (protocol/.git/trailing-slash stripped). No remote ->
//     "local/<repo-root-basename>". Every clone of the same repo derives the same
//     id -> same team automatically.
//   - gitUserName / gitUserEmail: `git config user.name` / `user.email`
//     (fallbacks $USER/"someone" for the name; "" for the email).
//   - currentBranch: `git rev-parse --abbrev-ref HEAD` (fallback "main").
//
// EVERYTHING here is FAIL-SOFT: git missing, no repo, no remote -> a sensible
// fallback, never a throw. We shell out with execFileSync (no shell, args array)
// so paths/urls can't be interpreted by a shell.

import { execFileSync } from "node:child_process";
import { basename } from "node:path";

/** Run a git command in `cwd`, returning trimmed stdout or null on any failure. */
function git(cwd: string, args: string[]): string | null {
  try {
    const out = execFileSync("git", ["-C", cwd, ...args], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 2000,
    });
    const trimmed = out.trim();
    return trimmed.length ? trimmed : null;
  } catch {
    return null; // git missing / not a repo / no config -> fail soft
  }
}

/** The repo's top-level dir, or null if `cwd` is not inside a git work tree. */
export function repoRoot(cwd: string): string | null {
  return git(cwd, ["rev-parse", "--show-toplevel"]);
}

/**
 * Normalize a git remote URL to a stable `host/owner/repo` workspace id. Handles
 * the common forms:
 *   https://github.com/acme/workspaces.git   -> github.com/acme/workspaces
 *   git@github.com:acme/workspaces.git        -> github.com/acme/workspaces
 *   ssh://git@github.com:22/acme/workspaces   -> github.com/acme/workspaces
 *   https://user:tok@host/owner/repo/         -> host/owner/repo
 * Returns null if the URL can't be reduced to host + path.
 */
export function normalizeRemote(url: string): string | null {
  let s = url.trim();
  if (!s) return null;

  const hadScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(s);
  // strip a leading scheme (https://, ssh://, git://, http://, ...).
  s = s.replace(/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//, "");
  // strip userinfo (user[:token]@) before the host — do this FIRST so a token's
  // ':' is never mistaken for an scp host:path separator.
  s = s.replace(/^[^/@]+@/, "");
  // scp-like form (no scheme, e.g. github.com:acme/workspaces): the ':' separates
  // host from path. Only treat ':' as that separator when it is NOT a numeric
  // :port and there was no scheme. (A scheme'd url uses '/' already.)
  if (!hadScheme) {
    const colon = s.indexOf(":");
    if (colon !== -1 && !/^[^/]+:\d+(\/|$)/.test(s)) {
      s = s.slice(0, colon) + "/" + s.slice(colon + 1);
    }
  }
  // strip a :port immediately after the host (host:22/owner/repo).
  s = s.replace(/^([^/:]+):\d+(\/|$)/, "$1$2");
  // collapse any duplicate slashes, drop a trailing .git, drop trailing slashes.
  s = s.replace(/\/{2,}/g, "/").replace(/\.git$/i, "").replace(/\/+$/, "");

  if (!s || !s.includes("/")) return null;
  return s;
}

/**
 * deriveWorkspaceId(cwd) — the team key (schema §10). The normalized origin
 * remote (host/owner/repo); if there is no origin remote, "local/<basename>" of
 * the repo root (or cwd when not in a repo). Never throws.
 */
export function deriveWorkspaceId(cwd: string): string {
  const remote = git(cwd, ["remote", "get-url", "origin"]);
  if (remote) {
    const norm = normalizeRemote(remote);
    if (norm) return norm;
  }
  const root = repoRoot(cwd) || cwd;
  return `local/${basename(root) || "workspace"}`;
}

/** `git config user.name`, fallback $USER, then "someone". Never throws. */
export function gitUserName(cwd: string): string {
  return git(cwd, ["config", "user.name"]) || process.env.USER || "someone";
}

/** `git config user.email`, fallback "". Never throws. */
export function gitUserEmail(cwd: string): string {
  return git(cwd, ["config", "user.email"]) || "";
}

/** `git rev-parse --abbrev-ref HEAD`, fallback "main". Never throws. */
export function currentBranch(cwd: string): string {
  const b = git(cwd, ["rev-parse", "--abbrev-ref", "HEAD"]);
  // a detached HEAD reports "HEAD"; treat that as no useful branch.
  if (b && b !== "HEAD") return b;
  // an UNBORN branch (a fresh repo with no commits) makes rev-parse fail; the
  // symbolic ref still resolves the configured branch name.
  const sym = git(cwd, ["symbolic-ref", "--short", "HEAD"]);
  if (sym) return sym;
  return "main";
}
