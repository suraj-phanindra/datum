<!--
Thanks for contributing to Datum. Keep the core dependency-free (Node built-ins only).
Fill out each section so reviewers can move quickly.
-->

## Summary

<!-- One or two sentences: what does this PR do and why? -->

## What changed

<!-- The concrete changes, grouped by area (server, cli, hooks, web, demo, docs, test). -->

-

## How tested

<!--
CI runs `npm test` (node --test) and `npm run demo` (the headless scenario) on Node 24.
Describe what you ran locally and what you observed. Include commands and output where it helps.
-->

- [ ] `npm test` passes locally
- [ ] `npm run demo` passes locally

## Linked issues

<!-- e.g. Closes #123, Fixes #456. -->

## Checklist

- [ ] No new runtime dependencies (core uses Node built-ins only; new tooling, if any, is a devDependency)
- [ ] Tests added or updated for the change
- [ ] Relative imports use explicit `.ts` extensions
- [ ] Docs updated where behavior or interfaces changed (README, docs/, or inline)
- [ ] The model stays off the critical path (the fast path stays deterministic; the fence still fires with the arbiter disabled)
