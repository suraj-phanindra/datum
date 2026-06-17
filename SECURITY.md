# Security Policy

Datum is the real-time coordination layer for teams whose engineers each run AI coding agents against the same repo. This document covers which versions receive security fixes, how to report a vulnerability, and the security-relevant facts you should understand before deploying it.

## Supported versions

| Version | Supported          |
| ------- | ------------------ |
| 0.2.x   | Yes                |
| < 0.2   | No                 |

Security fixes land on the latest 0.2.x release. Older versions do not receive backports; upgrade to a supported release to stay covered.

## Reporting a vulnerability

Please report security issues privately so we can investigate and ship a fix before any public disclosure.

The primary channel is GitHub's private vulnerability reporting (Security Advisories) on the [suraj-phanindra/datum](https://github.com/suraj-phanindra/datum) repository:

1. Open the repository's **Security** tab.
2. Choose **Report a vulnerability** to open a private advisory.
3. Include the affected version, reproduction steps, and the impact you observed.

Reports stay private to the maintainers and you until a fix is published. Maintainers aim to acknowledge new reports within a few business days. Please do not open a public issue for a suspected vulnerability, and please do not include secrets (API keys, tokens) in your report.

## Scope and design notes

Datum is a coordination aid for AI coding agents, not a security boundary. A few design facts are security-relevant, and we state them plainly so you can deploy it correctly.

### The fence fails open by design

The PreToolUse fence denies a stale write before it executes and feeds the agent a reason so it self-corrects. When the coordination bus is unreachable, the fence **fails open**: the write proceeds with a warning rather than blocking the agent. This is a deliberate availability-over-enforcement tradeoff so Datum never bricks an agent or stalls a team when the bus is down. Treat the fence as a coordination aid that prevents drift between cooperating teammates, not as an access control or a defense against a hostile actor. It will not stop someone who is trying to bypass it.

### The self-hosted bus trusts its network

The self-hosted bus (`datumctl serve`) has no login and trusts every client that can reach it; identity comes from each engineer's git config, which clients assert rather than prove. Run the bus on a trusted network only: bind it to localhost and front it with a tunnel or VPN, or keep it inside a private network. Do not expose it on the open internet. Datum Cloud is the path for teams that need authenticated, multi-tenant access with SSO.

### Keep the Anthropic API key out of the repo

The arbiter calls the Anthropic API with a bring-your-own key. That key must live in a gitignored `.env` file (or your environment) and must never be committed. Anyone with the key can spend against your account, so rotate it immediately if it is ever exposed, and prefer per-environment keys with the minimum scope you need.
