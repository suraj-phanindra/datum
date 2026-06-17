// Opaque API tokens for the CLI + hooks (Authorization: Bearer).
// We store ONLY the SHA-256 hash in D1 (never the plaintext). The plaintext is
// returned exactly once at mint time and never again recoverable.

import type { Env } from "../env.ts";

/** Principal resolved from a valid bearer token. */
export interface Principal {
  account_id: string;
  user_id: string | null;
  scopes: string[];
}

/** SHA-256 hex of a UTF-8 string, via crypto.subtle (available in Workers). */
export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(input),
  );
  const bytes = new Uint8Array(digest);
  let hex = "";
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, "0");
  }
  return hex;
}

/** Generate a random, URL-safe opaque token string (no padding). */
function randomToken(byteLength = 32): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * Mint a new opaque API token for (accountId, userId). Stores the SHA-256 hash plus
 * metadata in D1 `api_tokens`; returns the plaintext ONCE. A `dtm_` prefix makes the
 * token recognizable in logs/secrets scanners without revealing it.
 */
export async function mintToken(
  env: Env,
  accountId: string,
  userId: string | null,
  name: string,
): Promise<string> {
  const plaintext = `dtm_${randomToken(32)}`;
  const tokenHash = await sha256Hex(plaintext);
  const now = Date.now();

  await env.DB.prepare(
    `INSERT INTO api_tokens (token_hash, account_id, user_id, name, scopes, created_at, last_used_at, revoked)
     VALUES (?, ?, ?, ?, ?, ?, NULL, 0)`,
  )
    .bind(tokenHash, accountId, userId, name, "[]", now)
    .run();

  return plaintext;
}

/**
 * Validate an opaque bearer token. SHA-256-hex the presented token, look it up in
 * `api_tokens` where token_hash matches and revoked = 0. Returns a principal or null.
 * Best-effort bumps last_used_at; never throws on that bookkeeping write.
 */
export async function validateBearer(
  env: Env,
  token: string,
): Promise<Principal | null> {
  if (!token) return null;
  const tokenHash = await sha256Hex(token);

  const row = await env.DB.prepare(
    `SELECT account_id, user_id, scopes FROM api_tokens
     WHERE token_hash = ? AND revoked = 0`,
  )
    .bind(tokenHash)
    .first<{ account_id: string; user_id: string | null; scopes: string | null }>();

  if (!row) return null;

  let scopes: string[] = [];
  if (row.scopes) {
    try {
      const parsed = JSON.parse(row.scopes);
      if (Array.isArray(parsed)) scopes = parsed.map(String);
    } catch {
      scopes = [];
    }
  }

  // Best-effort last_used_at bump; do not block or fail auth on this.
  try {
    await env.DB.prepare(`UPDATE api_tokens SET last_used_at = ? WHERE token_hash = ?`)
      .bind(Date.now(), tokenHash)
      .run();
  } catch {
    // ignore bookkeeping failures
  }

  return {
    account_id: row.account_id,
    user_id: row.user_id,
    scopes,
  };
}
