-- 0001_init.sql — Datum Cloud D1 account plane.
-- Cross-tenant relational state: who-can-access-what. Per-workspace coordination
-- state (events, contracts, versions, ledger, sessions) lives in each WorkspaceBus
-- Durable Object's SQLite, never here. See docs/specs/ws2a-cloud-backend.md.

CREATE TABLE accounts    (id TEXT PRIMARY KEY, name TEXT, plan TEXT NOT NULL DEFAULT 'free', created_at INTEGER);

CREATE TABLE users       (id TEXT PRIMARY KEY, github_id INTEGER UNIQUE, login TEXT, email TEXT, name TEXT, created_at INTEGER);

CREATE TABLE workspaces  (id TEXT PRIMARY KEY,        -- host/owner/repo (same key the git-native client derives)
                          account_id TEXT NOT NULL, display_name TEXT, created_at INTEGER);

CREATE TABLE memberships (account_id TEXT NOT NULL, user_id TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'member',
                          PRIMARY KEY (account_id, user_id));

CREATE TABLE api_tokens  (token_hash TEXT PRIMARY KEY, account_id TEXT NOT NULL, user_id TEXT,
                          name TEXT, scopes TEXT NOT NULL DEFAULT '[]', created_at INTEGER,
                          last_used_at INTEGER, revoked INTEGER NOT NULL DEFAULT 0);
