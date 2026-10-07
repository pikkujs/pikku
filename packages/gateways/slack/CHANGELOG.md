# @pikku/gateway-slack

## 0.12.9

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

- 9b12c8a: Harden webhook signature verification. An empty or missing secret now fails closed at every call site (`verifyHmacSignature`, webhook source verification, `WebhookService.verify`, `verifySlackSignature`), including a signature computed over an empty key. HMAC verification now decodes the signature to bytes and compares with `crypto.subtle.verify('HMAC', ...)` instead of a pure-JS string compare, and a malformed hex signature is rejected. `verifyPublicKeySignature` accepts Ed25519 SPKI keys again.
- Updated dependencies [6f11bb5]
- Updated dependencies [0c67e33]
- Updated dependencies [15c4968]
- Updated dependencies [d75a23d]
- Updated dependencies [9b12c8a]
  - @pikku/core@0.12.138

## 0.12.8

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

- Updated dependencies [4c7a1b5]
  - @pikku/core@0.12.108

## 0.12.7

### Patch Changes

- 786dae5: Bump every dependency whose latest release is a major across the monorepo, and
  port the code the majors broke: `cookie` 2's `parseCookie`/`stringifySetCookie`
  API in `@pikku/core` and the three runtime HTTP adapters, and assistant-ui 0.15's
  store client in `@pikku/assistant-ui`.
- 6eef0a0: Bump every dependency to its latest compatible minor/patch across the monorepo.
- Updated dependencies [7722ceb]
- Updated dependencies [375c1ff]
- Updated dependencies [02a70cd]
- Updated dependencies [aeef159]
- Updated dependencies [a281de6]
- Updated dependencies [266e3bc]
- Updated dependencies [02a70cd]
- Updated dependencies [786dae5]
- Updated dependencies [6eef0a0]
- Updated dependencies [3561d67]
- Updated dependencies [a91c433]
- Updated dependencies [02a70cd]
- Updated dependencies [9537f74]
- Updated dependencies [2b57ca8]
- Updated dependencies [266e3bc]
- Updated dependencies [9fce0f1]
- Updated dependencies [83683a0]
- Updated dependencies [456c88b]
- Updated dependencies [456c88b]
- Updated dependencies [c127273]
  - @pikku/core@0.12.85

## 0.12.6

### Patch Changes

- 6794681: Publish the ecosystem surface as per-area sub-barrels under `@pikku/core/ecosystem/*`, and point generated code, the CLI, the inspector and the runtime adapters at them.

  348 names that only generated code, the toolchain or a runtime adapter ever imports now have a second home on `@pikku/core/ecosystem/<area>` — one sub-barrel per area, matching how core already publishes its entrypoints, so no single barrel grows without bound and a consumer only pulls in the area it uses.

  This step is additive: every name is still exported from the entrypoint it was published from before, so nothing downstream breaks. Removing them from the app-facing barrels is a later change, and needs a release carrying `./ecosystem/*` first.

- Updated dependencies [7406bfe]
- Updated dependencies [6794681]
  - @pikku/core@0.12.84

## 0.12.5

### Patch Changes

- fd9d834: Stop publishing internals that only their own package or file used. The declarations stay; only the entrypoint re-export is removed, so nothing that imported a name from where it is declared is affected.
- Updated dependencies [063f43a]
- Updated dependencies [ce66bf8]
- Updated dependencies [d0307a8]
- Updated dependencies [ce66bf8]
- Updated dependencies [3ad2131]
- Updated dependencies [b930dca]
- Updated dependencies [b95e77d]
- Updated dependencies [fd9d834]
- Updated dependencies [8978fbd]
  - @pikku/core@0.12.82

## 0.12.4

### Patch Changes

- 70fa400: Add outgoing webhooks — `webhookService.send()` enqueues signed deliveries onto a retrying queue, `@pikku/kysely`'s `KyselyWebhookService` persists per-attempt delivery history, and `@pikku/console` gains a read-only `/webhooks` page; also caches resolved secrets in `TypedSecretService` and registers inline-`func` metadata for queue/scheduler/trigger/gateway wirings.
- Updated dependencies [7ab5287]
- Updated dependencies [e86bc17]
- Updated dependencies [a9b96a0]
- Updated dependencies [3f7fc54]
- Updated dependencies [c478794]
- Updated dependencies [3f04ae4]
- Updated dependencies [90d9f04]
- Updated dependencies [cb079cc]
- Updated dependencies [cb079cc]
- Updated dependencies [0a7db82]
- Updated dependencies [981c4db]
- Updated dependencies [13474a6]
- Updated dependencies [5a2b0d5]
- Updated dependencies [13474a6]
- Updated dependencies [ee040dc]
- Updated dependencies [cb079cc]
- Updated dependencies [13474a6]
- Updated dependencies [9f0d0eb]
- Updated dependencies [13474a6]
- Updated dependencies [70fa400]
- Updated dependencies [7b2ea23]
- Updated dependencies [1dc77d5]
- Updated dependencies [416606c]
- Updated dependencies [d2a6eea]
- Updated dependencies [30e62ee]
  - @pikku/core@0.12.64

## 0.12.3

### Patch Changes

- e2286b4: SlackGatewayAdapter now enforces request-signature verification: `verifyWebhook` HMAC-verifies every inbound webhook (including url_verification) against the configured `signingSecret` using the raw request body, rejecting invalid/missing/stale signatures with UnauthorizedError. Previously `signingSecret` was accepted but never used, leaving webhook endpoints open to spoofed events.
- Updated dependencies [1f3f510]
  - @pikku/core@0.12.59

## 0.12.2

### Patch Changes

- 41ce2cb: Upgrade to TypeScript 6 and raise the minimum Node.js version to 22.

  All packages now build against `typescript@^6.0.3` and declare `engines.node >= 22`. Internal tooling (`ts-json-schema-generator`, `zod-to-ts`) was bumped to TypeScript 6-compatible releases.

- Updated dependencies [41ce2cb]
  - @pikku/core@0.12.44

## 0.12.1

### Patch Changes

- 87433f0: Make signingSecret required in SlackGatewayAdapterOptions to prevent accepting unverified webhook payloads.
- Updated dependencies [e412b4d]
- Updated dependencies [53dc8c8]
- Updated dependencies [0a1cc51]
- Updated dependencies [0a1cc51]
- Updated dependencies [0a1cc51]
- Updated dependencies [0a1cc51]
- Updated dependencies [0a1cc51]
- Updated dependencies [0a1cc51]
- Updated dependencies [0a1cc51]
- Updated dependencies [0a1cc51]
- Updated dependencies [0a1cc51]
- Updated dependencies [8b9b2e9]
- Updated dependencies [8b9b2e9]
- Updated dependencies [b973d44]
- Updated dependencies [8b9b2e9]
- Updated dependencies [8b9b2e9]
  - @pikku/core@0.12.9

## 0.12.0

### Minor Changes

- Initial release of Slack gateway adapter for Pikku
