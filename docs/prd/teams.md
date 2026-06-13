# teams.md — the self-hosted, git-native team layer

Codes against [`schema.md`](./schema.md) §10 (the FROZEN Teams contract). This
phase ships **self-hosted + git-native**: no login, no member list to maintain.
Hosted multi-tenant SaaS is the next phase.

## The model: the workspace IS the repo

A team is not a thing you create and invite people to. **The team is the repo.**
Membership = having the repo — git's own model. Identity derives from git config.
The only shared artifact is a committed `datum.json` and one running bus.

```
  one git repo  ──────────────►  one workspace_id  ──────────────►  one bus (one registry)
  (clone it = join it)            github.com/acme/workspaces          datum.json.bus_url
```

### Workspace id (the team key)

`datum init` derives the workspace id from the repo's origin remote, normalized to
`host/owner/repo`:

| remote | workspace_id |
|---|---|
| `https://github.com/acme/workspaces.git` | `github.com/acme/workspaces` |
| `git@github.com:acme/workspaces.git` | `github.com/acme/workspaces` |
| `ssh://git@github.com:22/acme/workspaces` | `github.com/acme/workspaces` |
| *(no origin remote)* | `local/<repo-dir-basename>` |

Normalization strips the protocol, any userinfo (`user:token@`), a `:port`, a
trailing `.git`, and trailing slashes. Because every clone of the same repo derives
the **same** workspace_id, two engineers who `git clone` the same repo land in the
**same team automatically** — there is nothing to configure.

### Git-native identity (zero login)

`datum init` derives, with flags overriding:

| field | source | fallback | override |
|---|---|---|---|
| `human` | `git config user.name` | `$USER` → `"someone"` | `--human` / `DATUM_HUMAN` |
| `email` | `git config user.email` | `""` | — |
| `branch` | `git rev-parse --abbrev-ref HEAD` | `symbolic-ref` → `"main"` | `--branch` / `DATUM_BRANCH` |
| `workspace_id` | the origin remote (above) | `local/<basename>` | `--workspace` |

All derivation is **fail-soft**: missing git, no repo, no remote, or an unborn
branch each fall back to a sensible default and never throw. Implemented in
[`cli/lib/git.ts`](../../cli/lib/git.ts).

## `datum.json` — the committed team config

A small JSON file at the **repo root**, committed so the whole team shares it:

```jsonc
{ "workspace": "auto",              // "auto" = derive from the git remote, or an explicit id
  "bus_url": "http://127.0.0.1:4317", // the shared bus everyone connects to
  "watchlist": {},                  // optional contract-surface overrides
  "spec_path": "docs/spec.md" }     // the arbiter's spec-patch target
```

- The **first** `datum init` **creates** it (you set up the team — you choose the
  bus_url). **Commit it.**
- **Subsequent** inits **read** it, so the whole team inherits one `bus_url` +
  `workspace`.
- `"workspace": "auto"` means derive the id from the git remote at init time; an
  explicit string pins it (useful for monorepos or mirrored remotes).
- Merge order for `bus_url` / `human`: **`datum.json` < env (`DATUM_BUS_URL` /
  `DATUM_HUMAN`) < flags.**

Read/write helpers: [`cli/lib/config.ts`](../../cli/lib/config.ts).

### `.datum/state.json` — per-user, gitignored

Gains `workspace_id` + `email` (schema §10):

```jsonc
{ "session_id": "...", "human": "asha", "email": "asha@acme.dev",
  "branch": "asha/schema", "workspace_id": "github.com/acme/workspaces",
  "last_synced_version": 8, "claim_files": [...], "claim_symbols": [...],
  "bus_url": "http://..." }
```

## The shared bus + tunnel

One bus = one workspace = one registry. The bus is **single-registry per team**:

- On the first join it **adopts** the `workspace_id` it sees.
- A session that joins with a **different** `workspace_id` gets a **warning** in the
  `POST /sessions` response (`{ warning: "this bus serves X, you are in Y" }`) —
  surfaced to the agent via `additionalContext`. It is **fail-open**: the warning
  never blocks the join. (Full multi-workspace tenancy is the hosted-SaaS step.)
- `session.joined` and `GET /sessions` carry `workspace_id` + `email`.

### Reaching the bus from anywhere

```bash
datumctl serve                 # binds 127.0.0.1 (local only)
datumctl serve --public        # binds 0.0.0.0 (shared / tunneled)
datumctl serve --host 0.0.0.0  # same as --public
```

`--public` (or `--host 0.0.0.0`) prints the bind URL **and a one-line tunnel hint**:

```
⌖ bus listening on http://127.0.0.1:4317 (bind 0.0.0.0)
shared bus — teammates set datum.json bus_url to your reachable URL
tunnel hint: tailscale (tailscale serve 4317) · ngrok (ngrok http 4317) · cloudflared (cloudflared tunnel --url http://localhost:4317)
```

A distributed team runs **one** `datumctl serve --public` (on a VM, or behind a
Tailscale / ngrok / cloudflared tunnel) and points `datum.json.bus_url` at it.

## The roster: `datumctl team`

`datumctl team` is `git shortlog` for the **live fleet**. It shows the
`workspace_id`, the shared `bus_url`, and the live roster from `GET /sessions` —
each member's human / email / branch / claim / status / synced version:

```
⌖ datum team · github.com/acme/workspaces
  bus   http://127.0.0.1:4317

  roster (3 members)
    [a] asha   asha@acme.dev   asha/schema  ● live   v7
        claim migrations/**, schema.sql, users.email, users.contact_email
    [b] ben    ben@acme.dev    ben/api      ● live   v7
        claim routes/users.ts, user.email, .email
    [c] chen   chen@acme.dev   chen/ui      ● live   v7
        claim UserCard.tsx, user.email, UserDTO.email

  ⌖ team at v8 · membership = having the repo
```

`--json` emits a machine record. `datumctl status` shows the workspace in its
header: `⌖ datum · team · github.com/acme/workspaces`. Presence everywhere keys on
the member, derived from git identity.

## Onboarding a team

```bash
# 1) one person stands up the shared bus (or run it on a VM / tunnel)
datumctl serve --public

# 2) the first engineer in the repo creates the shared config + commits it
datum init --bus-url http://bus.acme.internal:4317
git add datum.json && git commit -m "datum: shared team config"

# 3) every other engineer just clones + inits (datum.json is already there)
git clone git@github.com:acme/workspaces.git && cd workspaces
datum init                # reads datum.json, derives git identity, joins the team

# 4) see the fleet
datumctl team
```

## What's next (hosted SaaS)

Self-hosted is the wedge. The hosted phase adds true multi-tenant registries (one
bus, many workspaces), auth + org membership, and a managed bus URL — without
changing the git-native identity model: the workspace_id stays the team key.
