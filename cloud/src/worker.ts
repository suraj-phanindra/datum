// The Datum Cloud Worker router: edge auth + workspace_id -> WorkspaceBus DO.
//
// Routes:
//   GET  /healthz                -> 200 (unauthenticated)
//   GET  /auth/login             -> GitHub OAuth start (oauth.ts)
//   GET  /auth/callback          -> GitHub OAuth callback (oauth.ts)
//   POST /tokens                 -> mint an API token (requires a session cookie)
//   ANY  /w/:workspace_id/*      -> authenticate, membership-check, forward to the DO
//
// Auth modes for /w/* : Authorization: Bearer <token> (CLI + hooks, validated against
// D1 api_tokens), else a signed session cookie (dashboard, verified via HS256 JWT).
//
// NOTE: this Worker returns *real* 401/403/5xx. The client-side fence treats 5xx and
// timeouts as fail-open (allow-with-warning), so auth errors here must NOT be swallowed
// or downgraded into 5xx — a 401/403 is a real, intended signal, not a fence bypass.

import type { Env } from "./env.ts";
import { handleLogin, handleCallback } from "./auth/oauth.ts";
import { mintToken, validateBearer, type Principal } from "./auth/tokens.ts";
import { verifySession } from "./auth/jwt.ts";

const SESSION_COOKIE = "datum_session";

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

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** Resolve a session principal from the signed session cookie, or null. */
async function principalFromSession(
  request: Request,
  env: Env,
): Promise<Principal | null> {
  const cookies = parseCookies(request);
  const token = cookies[SESSION_COOKIE];
  if (!token) return null;
  const payload = await verifySession<{ user_id: string; account_id: string }>(
    token,
    env.SESSION_JWT_SECRET,
  );
  if (!payload || !payload.account_id) return null;
  return {
    account_id: payload.account_id,
    user_id: payload.user_id || null,
    scopes: [],
  };
}

/**
 * Authenticate a /w/* request via Bearer token (preferred for CLI/hooks) or session
 * cookie (dashboard). Returns a principal or null (=> 401).
 */
async function authenticate(request: Request, env: Env): Promise<Principal | null> {
  const authz = request.headers.get("Authorization");
  if (authz && authz.startsWith("Bearer ")) {
    const token = authz.slice("Bearer ".length).trim();
    const principal = await validateBearer(env, token);
    if (principal) return principal;
    // A presented-but-invalid bearer is a hard 401; do not fall back to cookie.
    return null;
  }
  return principalFromSession(request, env);
}

/** Is `origin` in the configured allowlist (comma-separated env.ALLOWED_ORIGINS)? */
function originAllowed(origin: string, env: Env): boolean {
  const list = (env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
  return list.includes(origin);
}

/**
 * Does this principal's account have access to `workspaceId`? A workspace belongs to
 * one account; the principal must (a) be that account and (b) have a memberships row.
 */
async function hasWorkspaceMembership(
  env: Env,
  principal: Principal,
  workspaceId: string,
): Promise<boolean> {
  const ws = await env.DB.prepare(`SELECT account_id FROM workspaces WHERE id = ?`)
    .bind(workspaceId)
    .first<{ account_id: string }>();
  if (!ws) return false;
  if (ws.account_id !== principal.account_id) return false;
  if (!principal.user_id) {
    // A token scoped to the account (no user) is still account-bound; the account
    // match above is sufficient. Confirm at least one membership exists for the account.
    const any = await env.DB.prepare(
      `SELECT 1 AS ok FROM memberships WHERE account_id = ? LIMIT 1`,
    )
      .bind(ws.account_id)
      .first<{ ok: number }>();
    return !!any;
  }
  const member = await env.DB.prepare(
    `SELECT 1 AS ok FROM memberships WHERE account_id = ? AND user_id = ? LIMIT 1`,
  )
    .bind(ws.account_id, principal.user_id)
    .first<{ ok: number }>();
  return !!member;
}

export async function handleFetch(
  request: Request,
  env: Env,
  _ctx: ExecutionContext,
): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method.toUpperCase();

  // Health check (unauthenticated).
  if (method === "GET" && path === "/healthz") {
    return new Response("ok", { status: 200 });
  }

  // GitHub OAuth.
  if (method === "GET" && path === "/auth/login") {
    return handleLogin(request, env);
  }
  if (method === "GET" && path === "/auth/callback") {
    return handleCallback(request, env);
  }

  // Mint an API token. Requires a valid dashboard session cookie.
  if (method === "POST" && path === "/tokens") {
    const principal = await principalFromSession(request, env);
    if (!principal) return json({ error: "unauthenticated" }, 401);

    let name = "cli";
    try {
      const body = (await request.json()) as { name?: unknown };
      if (body && typeof body.name === "string" && body.name.trim()) {
        name = body.name.trim();
      }
    } catch {
      // empty/invalid body is fine; use the default name
    }

    const plaintext = await mintToken(
      env,
      principal.account_id,
      principal.user_id,
      name,
    );
    // Plaintext is returned exactly ONCE; only its hash is persisted.
    return json({ token: plaintext, name }, 201);
  }

  // Workspace bus: /w/:workspace_id/*
  if (path.startsWith("/w/")) {
    const rest = path.slice("/w/".length); // ":workspace_id/..."
    const slash = rest.indexOf("/");
    // workspace_id is host/owner/repo, sent URL-encoded as a single path segment
    // (datum login bakes encodeURIComponent(workspace_id) into the bus url).
    const workspaceId = decodeURIComponent(slash === -1 ? rest : rest.slice(0, slash));
    if (!workspaceId) return json({ error: "missing workspace_id" }, 404);

    const principal = await authenticate(request, env);
    if (!principal) return json({ error: "unauthenticated" }, 401);

    const ok = await hasWorkspaceMembership(env, principal, workspaceId);
    if (!ok) return json({ error: "forbidden" }, 403);

    // CSWSH defense: a browser auto-attaches the session cookie to a cross-origin
    // WebSocket handshake, so a cookie-authenticated /stream upgrade must originate
    // from an allowlisted origin. Bearer-authenticated upgrades (CLI watchers) carry
    // no ambient credential and are not CSWSH-able, so they skip the Origin check.
    const isWsUpgrade =
      (request.headers.get("Upgrade") || "").toLowerCase() === "websocket";
    if (isWsUpgrade) {
      const usedBearer = (request.headers.get("Authorization") || "").startsWith(
        "Bearer ",
      );
      if (!usedBearer) {
        const origin = request.headers.get("Origin");
        if (!origin || !originAllowed(origin, env)) {
          return json({ error: "forbidden: websocket origin not allowed" }, 403);
        }
      }
    }

    // Strip the /w/:id prefix so the DO sees the bus-native path (e.g. /version).
    const downstreamPath = slash === -1 ? "/" : rest.slice(slash);
    const forwardUrl = new URL(request.url);
    forwardUrl.pathname = downstreamPath;

    const forwardRequest = new Request(forwardUrl.toString(), request);

    const stub = env.WORKSPACE_BUS.getByName(workspaceId);
    return stub.fetch(forwardRequest);
  }

  return json({ error: "not found" }, 404);
}
