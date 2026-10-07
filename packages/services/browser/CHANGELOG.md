# @pikku/browser

## 0.12.48

### Patch Changes

- 15c4968: The default runtime path no longer needs `node:*`, `Buffer` or an unguarded `process`, so it loads on edge runtimes (Web APIs only).

  **Breaking:** `FileScenarioRunStore`, `scenarioArtifactContentType` and `scenarioRunSummary` leave the `@pikku/core/services` barrel because they use `node:fs`. Import them from `@pikku/core/services/file-scenario-run-store`. Pre-0.13 breaking changes still ship as a patch.

  **Breaking:** the HMAC helpers in `@pikku/core/hmac` run on Web Crypto, which is async. `hmacSha256Hex`, `hmacDigest`, `verifyHmacSignature` and `verifyPublicKeySignature` now return a Promise; `timingSafeStringEqual` stays synchronous. `WebhookService.sign` and `WebhookService.verify` return a Promise, and so does `verifySlackSignature` in `@pikku/gateway-slack`: `await` them. A function-style `verify` on a webhook source may return a Promise as well. `verifyPublicKeySignature` accepts RSA and EC (P-256, P-384, P-521) PEM keys; Ed25519 and RSA-PSS keys verify as false.

  `isProduction()` (and the `PIKKU_MODEL_ALIASES` and `PIKKU_ENV` reads) now ask the registered singleton services' `variables` service first, then `process.env` when `process` exists. With neither, `isProduction()` is true, so an edge deployment never exposes error details by accident. `LocalVariablesService` resolves its `process.env` default when constructed and falls back to an empty store without `process`.

  Workflow invocation ids use a built-in SHA-1 and stay byte-identical. `@pikku/kysely` and the Cloudflare hibernation server use `globalThis.crypto.randomUUID()` and no `Buffer`; `@pikku/kysely` is marked `sideEffects: false`. `@pikku/ai-deepinfra` reads `DEEPINFRA_API_KEY` only when `process` exists and decodes base64 audio without `Buffer`.

  Runtime tiers. A package declares where it can run in `package.json`: `"pikku": { "runtime": "edge" | "serverless" | "server" }`, with optional per-subpath overrides (`"exports": { "./dev": "server" }`). `server` is the default. `@pikku/core` and the default services are `edge` (core's Node-only subpaths are `server`), `@pikku/better-auth`, `@pikku/addon-admin` and `@pikku/cloudflare` are `serverless` (better-auth statically imports `node:crypto` scrypt), and `@pikku/addon-console` is `server` and must never land in a deployed unit.

  `pikku deploy` now verifies each deployed unit before bundling it. The unit is bundled with esbuild (neutral platform, `workerd`/`worker`/`browser` conditions) under its tier's profile, ahead of the adapter's aliases and stubs so they cannot hide anything, and the build fails when the bundle holds a package declared above the unit's tier or a Node built-in the runtime does not provide. The error names the unit, package, import chain and the fix. A built-in the provider stubs is a warning. On an edge unit, a bundled `InMemory*` class also fails the build. The unit's tier is its `runtime`, else the project's own `pikku.runtime`, else the provider default (`serverless` on Cloudflare). Packages that declare nothing are judged by their imports only.

  `ProviderAdapter.getRuntimeProfile(tier?)` returns the compat date, compat flags, the built-ins the runtime provides (keyed by compat date), the stubbed ones and the externals. The Cloudflare adapter derives `wrangler.toml`, the upload metadata and the bundle externals from it; `node:os` and `node:fs` are not provided before compat date 2025-09-15. The default is `nodejs_compat_v2` with compat date 2024-12-18, which is what `wrangler.toml` and Fabric's live workers already use, so Fabric deploys see no runtime change. Only the direct-API upload in `@pikku/deploy-cloudflare` (`createWorker`, used by its own `deploy()`) moves: it sent `nodejs_compat` with 2024-01-01 before. A newer date or flag is opt-in through the adapter option `new CloudflareProviderAdapter({ compatDate })` or `getCloudflareRuntimeProfile(tier, compatDate)`. From 2025-08-15 `node:http` and `node:https` exist, and from 2025-09-15 `node:os`, `node:fs` (stubbed by the build regardless) and `node:perf_hooks`; the verifier's allowed built-ins follow the effective date. A newer date changes the runtime of every worker deployed with it.

  `declareScopes(['pikku:console'])` (from `@pikku/core/scope`) declares scopes by id without wiring anything. `wireAddon({ scopes })` only requires a scope of an addon's functions; the tree arrives with the addon's metadata, so a role granting `pikku:console` used to fail PKU124 unless the addon was wired, and a wired `@pikku/addon-console` lands in every unit carrying the `/rpc` catch-all. An app that grants the scope without the console now calls `declareScopes` and no longer needs the scaffold or the addon. When the addon is wired its tree and descriptions win and the bare id adds nothing.

  More packages declare a tier after bundling each with the edge profile. `edge`: `@pikku/addon-graph`, `@pikku/pino`, `@pikku/jose`, `@pikku/ai-vercel`, `@pikku/ai-voice`. `serverless`: `@pikku/kysely-postgres` (postgres.js needs `node:buffer`, `stream`, `events`), `@pikku/backblaze` (`copyFile` reads a local file, which the build stubs), `@pikku/gateway-slack` (`@slack/web-api` imports `node:os` and `zlib`). `server`: `@pikku/schedule` (`cron` imports `child_process`), `@pikku/aws-services` (the AWS SDK's Node handler needs `node:http2`), `@pikku/browser` (puppeteer), and `@pikku/modelcontextprotocol` except its `./fetch` subpath, which is `edge`.

  `@pikku/addon-graph` no longer needs `node:crypto` or `Buffer`: the Crypto function hashes and HMACs on Web Crypto (MD5 is built in, since Web Crypto has none) and encodes with `TextEncoder`/`atob`/`btoa`, with output unchanged.

## 0.12.47

### Patch Changes

- 4c7a1b5: Run the monorepo's own scripts through bun instead of yarn. What moves is the
  package manager each package's `prepublishOnly` and build scripts invoke, plus
  the two manifest fixes bun needs to resolve the tree: `uWebSockets.js` is
  declared with an explicit `github:` specifier, and `@pikku/uws-handler` marks
  its `uWebSockets.js` peer optional so a bun install of a consumer that brings
  its own uWS app does not try to fetch it from the registry.

  Three published behaviours change, all of them cases where an isolated
  `node_modules` or bun as the runtime had been papered over by yarn's hoisting:

  - `@pikku/migrator-sql` turns foreign keys on when it opens a sqlite database
    through bun. `node:sqlite` enforces them by default and `bun:sqlite` does not,
    which silently turned every `ON DELETE CASCADE` into a no-op under
    `bunx --bun pikku`.
  - `@pikku/cli` resolves a deploy provider against the project being deployed
    rather than against wherever the CLI itself is installed, which is what its
    own "is not installed" error asks the user to arrange.
  - `@pikku/cli` treats a specifier a runtime hands straight back — bun does this
    for the modules it implements itself — as not resolved from the project, so
    it falls back rather than loading the runtime's own copy.

## 0.12.46

### Patch Changes

- 3a83f85: Stop re-exporting package internals through entry points

  66 names reached consumers only because an `export *` in an entry point swept
  them up. Each one is referenced solely inside its own package, so the star is
  now an explicit named re-export listing what is genuinely public. The
  declarations themselves are untouched — this narrows the entry point, not the
  module.

## 0.12.45

### Patch Changes

- 786dae5: Bump every dependency whose latest release is a major across the monorepo, and
  port the code the majors broke: `cookie` 2's `parseCookie`/`stringifySetCookie`
  API in `@pikku/core` and the three runtime HTTP adapters, and assistant-ui 0.15's
  store client in `@pikku/assistant-ui`.
- 6eef0a0: Bump every dependency to its latest compatible minor/patch across the monorepo.

## 0.12.44

### Patch Changes

- daec082: Drop Node 22 support — the minimum supported runtime is now Node 24 (LTS).

  Node 22 deadlocks `pikku dev` at `loadUserBootstrap` (tsx `register()` + `require(esm)` cycle handling on node 22.12+), and Node 20 is already below our floor. The `engines.node` requirement is raised to `>=24` across all packages, matching `.nvmrc` and the CI test matrix. Closes #751.

## 0.12.43

### Patch Changes

- 41ce2cb: Upgrade to TypeScript 6 and raise the minimum Node.js version to 22.

  All packages now build against `typescript@^6.0.3` and declare `engines.node >= 22`. Internal tooling (`ts-json-schema-generator`, `zod-to-ts`) was bumped to TypeScript 6-compatible releases.

## 0.12.42

### Patch Changes

- d720ae8: Add `@pikku/browser` — a browser-automation service with a session API modeled on `@cloudflare/puppeteer` (`acquire`/`launch`/`connect`/`sessions`/`limits`) so one consumer code path reuses warm browsers identically on Cloudflare and locally. Ships `LocalBrowserService`, a Node fallback with an in-process keep-alive session pool. `puppeteer-core` is an optional peer dep, lazy-imported in `launch`, and pinned to the exact version (`22.13.1`) that `@cloudflare/puppeteer` forks so `page.*` behaves identically both sides. It's puppeteer-**core** (not puppeteer) so installing it never downloads a Chromium binary — the local runtime points at a system/remote browser via `executablePath` (`$PUPPETEER_EXECUTABLE_PATH`) or the installed `chrome` channel; a project that only runs on Cloudflare never needs it at all.
