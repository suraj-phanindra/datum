// cloud/src/github-app.ts — the Cloud spec-PR client.
//
// The OSS spec-pr path shells `git`/`gh` (server/arbiter/spec-pr.ts), which does
// not exist in a Worker. For Datum Cloud the arbiter Queue consumer opens the
// spec PR through a GitHub App installation token instead: mint an App JWT
// (RS256, signed with crypto.subtle over the PKCS8 private key in the secret),
// exchange it for a short-lived installation token, then create the branch +
// docs/spec.md commit + PR via the GitHub REST API. This is the Cloud half of
// the `openSpecPR` seam (WS2a spec §"GitHub App").
//
// Everything is fetch-only and Workers-compatible: no node:fs, no child_process.
// Always send a User-Agent header (GitHub rejects API requests without one).

import type { Env } from "./env.ts";

const GITHUB_API = "https://api.github.com";
const USER_AGENT = "datum-cloud-arbiter";

// ---- small base64 helpers (Workers: btoa/atob over binary strings) ----

/** URL-safe base64 (no padding) of bytes — for JWT segments. */
function base64UrlFromBytes(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** URL-safe base64 of a UTF-8 string — for JWT header/claims. */
function base64UrlFromString(s: string): string {
  return base64UrlFromBytes(new TextEncoder().encode(s));
}

/** Standard base64 (with padding) of a UTF-8 string — for file contents. */
function base64FromString(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

// ---- PKCS8 import + RS256 sign via crypto.subtle ----

/**
 * Import the App private key (PEM PKCS8 in env.GITHUB_APP_PRIVATE_KEY) into a
 * crypto.subtle CryptoKey for RS256 signing. Tolerates literal "\n" escapes in
 * the secret (wrangler secrets are single-line).
 */
async function importPrivateKey(pem: string): Promise<CryptoKey> {
  const normalized = pem.replace(/\\n/g, "\n");
  const body = normalized
    .replace(/-----BEGIN [^-]+-----/g, "")
    .replace(/-----END [^-]+-----/g, "")
    .replace(/\s+/g, "");
  const der = Uint8Array.from(atob(body), (c) => c.charCodeAt(0));
  return crypto.subtle.importKey(
    "pkcs8",
    der.buffer as ArrayBuffer,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
}

/**
 * appJwt — sign an RS256 GitHub App JWT. Claims: iat (60s back-dated for clock
 * skew), exp (<= 10 minutes, GitHub's hard cap), iss = the App id. Signed with
 * the PKCS8 private key via crypto.subtle.
 */
export async function appJwt(env: Env): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const claims = {
    iat: now - 60,
    exp: now + 9 * 60, // <= 10 min cap, with margin.
    iss: env.GITHUB_APP_ID,
  };
  const signingInput =
    base64UrlFromString(JSON.stringify(header)) +
    "." +
    base64UrlFromString(JSON.stringify(claims));

  const key = await importPrivateKey(env.GITHUB_APP_PRIVATE_KEY);
  const sig = await crypto.subtle.sign(
    { name: "RSASSA-PKCS1-v1_5" },
    key,
    new TextEncoder().encode(signingInput),
  );
  return signingInput + "." + base64UrlFromBytes(new Uint8Array(sig));
}

/**
 * installationToken — exchange the App JWT for a short-lived (1h) installation
 * access token at POST /app/installations/{id}/access_tokens.
 */
export async function installationToken(env: Env): Promise<string> {
  const jwt = await appJwt(env);
  const res = await fetch(
    `${GITHUB_API}/app/installations/${env.GITHUB_APP_INSTALLATION_ID}/access_tokens`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${jwt}`,
        Accept: "application/vnd.github+json",
        "User-Agent": USER_AGENT,
      },
    },
  );
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`installation token exchange failed: ${res.status} ${detail}`);
  }
  const data = (await res.json()) as { token?: string };
  if (!data.token) throw new Error("installation token response missing token");
  return data.token;
}

// ---- the PR client ----

export type OpenSpecPRParams = {
  owner: string;
  repo: string;
  base: string;
  branch: string;
  path: string;
  content: string;
  title: string;
  body: string;
};

export type OpenSpecPRResult = {
  pr_number: number;
  url: string;
};

function ghHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "User-Agent": USER_AGENT,
    "content-type": "application/json",
  };
}

/**
 * openSpecPR — create the branch off `base`, commit `content` to `path`, and
 * open a PR `branch` -> `base`. Steps (all via the REST API with an installation
 * token):
 *   1. GET the base ref to read its tip sha,
 *   2. POST refs to create refs/heads/<branch> at that sha (tolerate "already
 *      exists" so a Queue retry is idempotent),
 *   3. GET the existing file's blob sha if present, then PUT contents (base64,
 *      including sha when updating) on the branch,
 *   4. POST pulls to open the PR (reuse the open PR if one already exists for
 *      this head, again for retry-idempotency).
 * Returns { pr_number, url }.
 */
export async function openSpecPR(
  params: OpenSpecPRParams,
  token: string,
): Promise<OpenSpecPRResult> {
  const { owner, repo, base, branch, path, content, title, body } = params;
  const repoUrl = `${GITHUB_API}/repos/${owner}/${repo}`;
  const headers = ghHeaders(token);

  // 1) base ref tip sha.
  const refRes = await fetch(`${repoUrl}/git/ref/heads/${base}`, {
    headers: { ...headers },
  });
  if (!refRes.ok) {
    const detail = await refRes.text().catch(() => "");
    throw new Error(`GET base ref ${base} failed: ${refRes.status} ${detail}`);
  }
  const refData = (await refRes.json()) as { object?: { sha?: string } };
  const baseSha = refData.object?.sha;
  if (!baseSha) throw new Error(`base ref ${base} has no sha`);

  // 2) create the branch (idempotent: 422 == ref already exists).
  const createRefRes = await fetch(`${repoUrl}/git/refs`, {
    method: "POST",
    headers,
    body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: baseSha }),
  });
  if (!createRefRes.ok && createRefRes.status !== 422) {
    const detail = await createRefRes.text().catch(() => "");
    throw new Error(`create ref ${branch} failed: ${createRefRes.status} ${detail}`);
  }

  // 3) PUT the file contents on the branch (with sha if the file already exists).
  let existingSha: string | undefined;
  const getFileRes = await fetch(
    `${repoUrl}/contents/${path}?ref=${encodeURIComponent(branch)}`,
    { headers: { ...headers } },
  );
  if (getFileRes.ok) {
    const fileData = (await getFileRes.json()) as { sha?: string };
    existingSha = fileData.sha;
  }
  const putRes = await fetch(`${repoUrl}/contents/${path}`, {
    method: "PUT",
    headers,
    body: JSON.stringify({
      message: title,
      content: base64FromString(content),
      branch,
      ...(existingSha ? { sha: existingSha } : {}),
    }),
  });
  if (!putRes.ok) {
    const detail = await putRes.text().catch(() => "");
    throw new Error(`PUT contents ${path} failed: ${putRes.status} ${detail}`);
  }

  // 4) open the PR (reuse an existing open PR for this head on retry).
  const head = `${owner}:${branch}`;
  const pullRes = await fetch(`${repoUrl}/pulls`, {
    method: "POST",
    headers,
    body: JSON.stringify({ title, head: branch, base, body }),
  });
  if (pullRes.ok) {
    const pr = (await pullRes.json()) as { number?: number; html_url?: string };
    return { pr_number: pr.number ?? 0, url: pr.html_url ?? "" };
  }
  if (pullRes.status === 422) {
    // A PR for this head already exists — find and reuse it (retry-idempotent).
    const listRes = await fetch(
      `${repoUrl}/pulls?head=${encodeURIComponent(head)}&base=${encodeURIComponent(base)}&state=open`,
      { headers: { ...headers } },
    );
    if (listRes.ok) {
      const list = (await listRes.json()) as Array<{ number?: number; html_url?: string }>;
      if (list.length > 0) {
        return { pr_number: list[0].number ?? 0, url: list[0].html_url ?? "" };
      }
    }
  }
  const detail = await pullRes.text().catch(() => "");
  throw new Error(`open PR ${head} -> ${base} failed: ${pullRes.status} ${detail}`);
}

/** A GitHubApp client bundling the token mint + PR open against one Env. */
export class GitHubApp {
  constructor(private env: Env) {}

  appJwt(): Promise<string> {
    return appJwt(this.env);
  }

  installationToken(): Promise<string> {
    return installationToken(this.env);
  }

  openSpecPR(params: OpenSpecPRParams, token: string): Promise<OpenSpecPRResult> {
    return openSpecPR(params, token);
  }
}
