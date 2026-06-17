// cloud/src/env.ts — the frozen cloud-internal Env contract.
// All Datum Cloud tracks code against this interface. Do not change without
// updating wrangler.jsonc bindings and the secrets list in lockstep.

export interface Env {
  WORKSPACE_BUS: DurableObjectNamespace;
  DB: D1Database;
  ARBITER_QUEUE: Queue;
  GITHUB_CLIENT_ID: string;
  GITHUB_CLIENT_SECRET: string;
  SESSION_JWT_SECRET: string;
  GITHUB_APP_ID: string;
  GITHUB_APP_PRIVATE_KEY: string;
  GITHUB_APP_INSTALLATION_ID: string;
  ANTHROPIC_API_KEY: string;
  // Comma-separated allowlist of dashboard origins permitted to open the /stream
  // WebSocket using the session cookie (CSWSH defense). Optional, set as a plain var
  // (not a secret). If unset, only Bearer-authenticated WebSocket upgrades are accepted.
  ALLOWED_ORIGINS?: string;
}
