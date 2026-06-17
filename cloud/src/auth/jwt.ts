// HS256 compact JWT for dashboard session cookies.
// Signed/verified with crypto.subtle HMAC SHA-256 (available in Workers).
// No external deps: this is a tiny, self-contained JWT implementation.

export interface SessionPayload {
  // Standard-ish session claims. exp is added by signSession.
  user_id: string;
  account_id: string;
  login?: string;
  [k: string]: unknown;
}

function base64UrlEncode(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlEncodeString(s: string): string {
  return base64UrlEncode(new TextEncoder().encode(s));
}

function base64UrlDecodeToBytes(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + pad;
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function base64UrlDecodeToString(s: string): string {
  return new TextDecoder().decode(base64UrlDecodeToBytes(s));
}

async function importKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

// Constant-time-ish comparison of two equal-length byte arrays.
function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

/**
 * Sign a compact HS256 JWT. Adds `iat` and an `exp` (default 7 days) if not present.
 */
export async function signSession(
  payload: SessionPayload,
  secret: string,
  expiresInSeconds = 60 * 60 * 24 * 7,
): Promise<string> {
  const header = { alg: "HS256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const body: Record<string, unknown> = {
    iat: now,
    exp: now + expiresInSeconds,
    ...payload,
  };

  const headerPart = base64UrlEncodeString(JSON.stringify(header));
  const payloadPart = base64UrlEncodeString(JSON.stringify(body));
  const signingInput = `${headerPart}.${payloadPart}`;

  const key = await importKey(secret);
  const sig = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(signingInput)),
  );
  const sigPart = base64UrlEncode(sig);

  return `${signingInput}.${sigPart}`;
}

/**
 * Verify a compact HS256 JWT and check expiry. Returns the decoded payload, or null
 * if the token is malformed, the signature is invalid, or it has expired.
 */
export async function verifySession<T = SessionPayload & { iat: number; exp: number }>(
  token: string,
  secret: string,
): Promise<T | null> {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [headerPart, payloadPart, sigPart] = parts;
  const signingInput = `${headerPart}.${payloadPart}`;

  let header: { alg?: string };
  try {
    header = JSON.parse(base64UrlDecodeToString(headerPart));
  } catch {
    return null;
  }
  if (!header || header.alg !== "HS256") return null;

  const key = await importKey(secret);
  let expectedSig: Uint8Array;
  try {
    expectedSig = new Uint8Array(
      await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(signingInput)),
    );
  } catch {
    return null;
  }

  let providedSig: Uint8Array;
  try {
    providedSig = base64UrlDecodeToBytes(sigPart);
  } catch {
    return null;
  }
  if (!timingSafeEqual(expectedSig, providedSig)) return null;

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(base64UrlDecodeToString(payloadPart));
  } catch {
    return null;
  }

  const exp = payload.exp;
  if (typeof exp === "number") {
    const now = Math.floor(Date.now() / 1000);
    if (now >= exp) return null;
  }

  return payload as T;
}
