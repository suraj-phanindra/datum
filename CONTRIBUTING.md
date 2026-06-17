# Contributing to Datum

Thanks for helping build Datum, the real-time coordination layer for teams whose engineers each run AI coding agents against the same repo. Git coordinates code at rest. Datum coordinates agents in motion.

We optimize for zero friction. The project has zero runtime dependencies, a single devDependency (esbuild for bundling), and a tiny toolchain: clone, install, run the tests, run the demo. If a contribution adds setup steps, build flags, or a new dependency, that is a cost we weigh carefully. The fastest path to a merged PR is a small, focused change with tests that pass the same gate CI runs.

## Development setup

1. Fork the repository, then clone your fork:

   ```bash
   git clone https://github.com/<you>/datum
   cd datum
   ```

2. Use Node 24 for development (CI runs on Node 24 too).

   Datum runs its TypeScript sources directly, with no build step for development. That relies on two native Node features:

   - **TypeScript type-stripping** (running `.ts` files without a compiler) needs Node >= 22.6.
   - **`node:sqlite`** (the registry and bus storage) needs Node >= 22.5.

   Node 24 covers both comfortably, so pin to it locally to match CI. (Note: installed hooks on an engineer's machine only need Node >= 18, since they ship as bundled output. The higher version is a development and CI requirement, not an end-user one.)

3. Install dependencies with a clean, lockfile-exact install:

   ```bash
   npm ci
   ```

## Running it

All entry points run straight from source. No build needed for any of these except the package bundle.

```bash
npm test          # run the test suite (node --test)
npm run demo      # run the headless end-to-end scenario
npm run server    # start the coordination bus (server/index.ts)
npm run web       # serve the read-only "tower" dashboard (web/serve.ts)
npm run build     # bundle the package to dist/ via esbuild
```

## Project layout

A brief map. See the README for the fuller tour.

- `server/` bus, registry, watchlist parser, arbiter, and MCP server
- `cli/` the `datumctl` entry point and its commands
- `hooks/` the four hooks: `datum-fence` (PreToolUse), `datum-claim` (PostToolUse), `datum-join` (SessionStart), `datum-guard` (Stop, optional)
- `web/` the read-only tower dashboard
- `demo/` the headless scenario behind `npm run demo`
- `test/` the `node --test` suites
- `docs/` the roadmap, design brief, and spec

## Code style

- **TypeScript throughout.** No JavaScript source files.
- **Zero runtime dependencies is a hard guarantee.** Datum ships with no runtime dependencies and uses Node built-ins only. Adding a runtime dependency is a product decision, not a code-review detail: it requires maintainer discussion first, in an issue, before the PR. Reach for `node:` built-ins (`node:sqlite`, `node:http`, `node:crypto`, `node:test`, and friends) instead. The only devDependency is esbuild.
- **Relative imports use explicit `.ts` extensions** (`import { x } from "./registry.ts"`). This is what lets Node run the sources directly.
- **Prefer `async`/`await`** over raw promise chains and callbacks.
- **No em dashes** in code, comments, or docs. Use commas, parentheses, or restructure the sentence.

## Tests

- **Every change needs tests.** A bug fix needs a test that fails before the fix and passes after. A feature needs tests that cover its behavior.
- Tests run with the built-in runner: `node --test`. No test framework to learn, no config.
- The **CI gate** runs `npm test`, `npm run build`, and `npm run demo`, and **all must pass** for a PR to be mergeable. The demo is a real end-to-end check, not a fixture, so treat a demo failure as a real regression.
- `npm run typecheck` exists for local use, but `tsc` is not installed as a dependency and CI does not run it. Do not rely on it as a gate.

## Commit and PR process

- Keep PRs **small and focused**. One change per PR is easier to review and faster to merge.
- Write **descriptive commit messages** that explain the why, not just the what.
- **Link the issue** the PR addresses. For anything that adds a runtime dependency or changes a public contract, open an issue and get maintainer sign-off first.
- **CI must be green** (`npm test`, `npm run build`, and `npm run demo` all passing) before review. Push the fix, do not ask a reviewer to imagine it works.

## Code of Conduct

This project follows our [Code of Conduct](CODE_OF_CONDUCT.md). By participating, you agree to uphold it. Be the kind of collaborator you would want to merge a PR from.
