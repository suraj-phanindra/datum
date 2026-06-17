# Datum (Claude Code plugin)

Datum is the real-time coordination layer for teams whose engineers each run a
Claude Code agent against the same feature. Git coordinates code at rest; Datum
coordinates agents in motion, so one agent renaming a column or swapping a
dependency does not silently break what the others are building.

## What this plugin installs

- Four hooks (in `hooks/hooks.json`):
  - `SessionStart` -> `datum-join`: registers the session and syncs the current
    registry snapshot into context.
  - `PostToolUse` (Edit, Write, MultiEdit) -> `datum-claim`: streams every edit
    to the bus and bumps the registry version on contract-surface changes.
  - `PreToolUse` (Edit, Write, MultiEdit) -> `datum-fence`: blocks a write that
    targets a contract that changed since this session last synced.
  - `Stop` -> `datum-guard`: keeps the agent working while unacknowledged deltas
    intersect its diff.
- The `datum` MCP server (`.mcp.json`, stdio): registry, deltas, decisions,
  advisories, claims, sync, and session tools.
- Five skills (`skills/`), namespaced `/datum:<name>`: `coordinate`, `claim`,
  `sync`, `resolve-fence`, and `decide`.

## Install

```
/plugin marketplace add suraj-phanindra/datum
/plugin install datum@datum
```

## Requirements

The plugin needs a running bus. Start one with:

```
datumctl serve
```

No separate `datum init` is required: `datum-join` self-seeds git-native identity
(name, email, branch, workspace) into `.datum/state.json` on first session, fail
soft and idempotent. Solo users get localhost by default; teams pick up their
shared bus from the committed `datum.json`.

## Configuration

`bus_url` (user config, prompted on enable) sets the bus this session
coordinates against. It defaults to `http://127.0.0.1:4317` and is passed to the
MCP server as `DATUM_BUS_URL`.
