---
name: setup
description: Use when Datum is not fully configured in this workspace (the bus is down, hooks or MCP are not wired, or you just installed the plugin), or run as /datum:setup. Configures Datum on this machine with zero manual steps for the user - wires hooks and MCP, seeds identity, starts the local bus in the background, or signs in to Datum Cloud, and verifies with datum doctor.
---

# Setup

You own the setup. The user should not have to run anything by hand. Drive it end to
end with the `datum` CLI, then confirm it is healthy. If `datum` is not on PATH, use
`npx datumctl` for every command below (same subcommands).

## Procedure

1. **Diagnose.** Run `datum doctor --json`. It reports each check (node, state,
   hooks, MCP, bus reachable, sync) with a `pass` flag. Read it and fix only what
   failed.

2. **Wire hooks + MCP + state (if the plugin did not already).** If `state`, any
   `hook`, or `mcpServers.datum` failed in doctor, run `datum init`. It is idempotent
   and git-native (derives identity from git config, workspace from the remote, and
   creates or reads the committed `datum.json`). Plugin installs already provide the
   hooks and MCP, so this is mostly for a non-plugin / CLI-only setup.

3. **Bring up the bus.**
   - Self-hosted (the default, bus_url is `127.0.0.1`): if doctor said the bus is not
     reachable, run `datum up`. It starts the bus in the background and returns once
     it is healthy (logs to `.datum/bus.log`). It is idempotent, so it is safe to run
     anytime the bus looks down. `datum down` stops it.
   - Datum Cloud (a hosted bus): run `datum login --bus <cloud-url>` to authenticate.
     This is the one step that needs the user - it prints a URL to sign in and reads
     back the token. There is no local bus to start in cloud mode.

4. **Verify.** Run `datum doctor` again and confirm it prints `healthy`. If a `drift`
   (behind the epoch) shows up, run `datum sync`.

5. **Report** one line: mode (self-hosted or cloud), bus status, and that
   coordination is now live. Then point the user at `/datum:coordinate` for the daily
   loop.

Keep the bus alive: `datum up` is idempotent. If a later session's SessionStart nudge
says the bus is down, just run `datum up` again.
