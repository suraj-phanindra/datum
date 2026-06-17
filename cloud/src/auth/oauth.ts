// GitHub OAuth login for the dashboard.
//   GET /auth/login    -> 302 to GitHub authorize, with CSRF `state` in a signed,
//                         short-lived HttpOnly cookie.
//   GET /auth/callback -> verify state, exchange code -> GitHub access token,
//                         GET /user, upsert users + ensure an accounts row +
//                         memberships in D1, mint a session JWT, set cookie, redirect.
//
// Client id/secret + the session JWT secret come from Wrangler secrets (env).

import type { Env } from "../env.ts";
import { signSession, verifySession } from "./jwt.ts";

const GITHUB_AUTHORIZE = "https://github.com/login/oauth/authorize";
const GITHUB_TOKEN = "https://github.com/login/oauth/access_token";
const GITHUB_USER = "https://api.github.com/user";
const USER_AGENT = "datum-cloud";

const STATE_COOKIE = "datum_oauth_state";
const SESSION_COOKIE = "datum_session";

// Where to send the user after a successful login. Relative path on this origin.
const POST_LOGIN_REDIRECT = "/";

function redirectUri(request: Request): string {
  const url = new URL(request.url);
  return `${url.origin}/auth/callback`;
}

function randomState(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function parseCookies(request: Request): Record<string, string> {
  const header = request.headers.get("Cookie") || "";
  const out: Record<string, string> = {};
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (k) out[k] = decodeURIComponent(v);
  }
  return out;
}

function cookie(
  name: string,
  value: string,
  opts: { maxAge?: number; path?: string } = {},
): string {
  const path = opts.path ?? "/";
  let c = `${name}=${encodeURIComponent(value)}; HttpOnly; Secure; SameSite=Lax; Path=${path}`;
  if (typeof opts.maxAge === "number") c += `; Max-Age=${opts.maxAge}`;
  return c;
}

/**
 * GET /auth/login -> 302 to GitHub's authorize endpoint. The CSRF `state` is signed
 * into a short-lived (10 min) HttpOnly cookie so we can verify it on the callback
 * without server-side state.
 */
export async function handleLogin(request: Request, env: Env): Promise<Response> {
  const state = randomState();
  // The state cookie is itself a signed JWT carrying the nonce, so it can't be forged.
  const stateToken = await signSession(
    { user_id: "", account_id: "", nonce: state },
    env.SESSION_JWT_SECRET,
    600, // 10 minutes
  );

  const authorize = new URL(GITHUB_AUTHORIZE);
  authorize.searchParams.set("client_id", env.GITHUB_CLIENT_ID);
  authorize.searchParams.set("redirect_uri", redirectUri(request));
  authorize.searchParams.set("scope", "read:user");
  authorize.searchParams.set("state", state);

  return new Response(null, {
    status: 302,
    headers: {
      Location: authorize.toString(),
      "Set-Cookie": cookie(STATE_COOKIE, stateToken, { maxAge: 600 }),
    },
  });
}

/**
 * GET /auth/callback -> verify state, exchange the code for a GitHub access token,
 * fetch the GitHub identity, upsert into D1, mint a session JWT, set the cookie,
 * and redirect into the app.
 */
export async function handleCallback(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state) {
    return new Response("missing code or state", { status: 400 });
  }

  // Verify the state nonce against the signed cookie.
  const cookies = parseCookies(request);
  const stateToken = cookies[STATE_COOKIE];
  if (!stateToken) return new Response("missing state cookie", { status: 400 });
  const decoded = await verifySession<{ nonce?: string }>(
    stateToken,
    env.SESSION_JWT_SECRET,
  );
  if (!decoded || decoded.nonce !== state) {
    return new Response("invalid state", { status: 400 });
  }

  // Exchange the code for a GitHub access token.
  const tokenResp = await fetch(GITHUB_TOKEN, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "User-Agent": USER_AGENT,
    },
    body: JSON.stringify({
      client_id: env.GITHUB_CLIENT_ID,
      client_secret: env.GITHUB_CLIENT_SECRET,
      code,
      redirect_uri: redirectUri(request),
    }),
  });
  if (!tokenResp.ok) {
    return new Response("github token exchange failed", { status: 502 });
  }
  const tokenJson = (await tokenResp.json()) as {
    access_token?: string;
    error?: string;
  };
  const accessToken = tokenJson.access_token;
  if (!accessToken) {
    return new Response("github token exchange failed", { status: 502 });
  }

  // Fetch the GitHub identity.
  const userResp = await fetch(GITHUB_USER, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/vnd.github+json",
      "User-Agent": USER_AGENT,
    },
  });
  if (!userResp.ok) {
    return new Response("github user fetch failed", { status: 502 });
  }
  const gh = (await userResp.json()) as {
    id?: number;
    login?: string;
    email?: string | null;
    name?: string | null;
  };
  if (typeof gh.id !== "number" || !gh.login) {
    return new Response("github user fetch failed", { status: 502 });
  }

  const { userId, accountId } = await upsertIdentity(env, {
    id: gh.id,
    login: gh.login,
    email: gh.email,
    name: gh.name,
  });

  // Mint a session JWT, set the cookie, redirect into the app.
  const jwt = await signSession(
    { user_id: userId, account_id: accountId, login: gh.login },
    env.SESSION_JWT_SECRET,
  );

  const headers = new Headers();
  headers.set("Location", POST_LOGIN_REDIRECT);
  headers.append("Set-Cookie", cookie(SESSION_COOKIE, jwt));
  // Clear the now-consumed state cookie.
  headers.append("Set-Cookie", cookie(STATE_COOKIE, "", { maxAge: 0 }));

  return new Response(null, { status: 302, headers });
}

/**
 * Upsert the GitHub user into D1: users row, a personal accounts row, and a
 * memberships row tying the user to that account. Deterministic ids derived from the
 * GitHub id keep this idempotent across logins.
 */
async function upsertIdentity(
  env: Env,
  gh: { id: number; login?: string; email?: string | null; name?: string | null },
): Promise<{ userId: string; accountId: string }> {
  const userId = `gh_${gh.id}`;
  const accountId = `acct_gh_${gh.id}`;
  const now = Date.now();

  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO users (id, github_id, login, email, name, created_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET login = excluded.login,
                                     email = excluded.email,
                                     name = excluded.name`,
    ).bind(userId, gh.id, gh.login ?? null, gh.email ?? null, gh.name ?? null, now),
    env.DB.prepare(
      `INSERT INTO accounts (id, name, plan, created_at)
       VALUES (?, ?, 'free', ?)
       ON CONFLICT(id) DO NOTHING`,
    ).bind(accountId, gh.login ?? userId, now),
    env.DB.prepare(
      `INSERT INTO memberships (account_id, user_id, role)
       VALUES (?, ?, 'owner')
       ON CONFLICT(account_id, user_id) DO NOTHING`,
    ).bind(accountId, userId),
  ]);

  return { userId, accountId };
}
