# @pikku/backblaze

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

- 266e3bc: One door per name: `@pikku/core/ecosystem/*` and the package root are gone

  `@pikku/core` published every module twice. `ecosystem/http` re-exported
  `./http`, `ecosystem/services` re-exported `./services`, and a name was
  reachable through either — so every addition had to be made in two places, and a
  consumer's import said nothing about what it actually used. The package root was
  the same problem at a larger scale: a single barrel of 206 names that no bundler
  could take apart, and the one specifier that revealed nothing at all.

  Both are deleted. Every name now lives on the subpath that owns it, and every
  import carries that subpath — `@pikku/core/http`, `@pikku/core/services`,
  `@pikku/core/errors`, `@pikku/core/types`.

  Deleting the facades meant the raw subpaths had to become a superset of them,
  which they were not: the facade tree had accumulated 25 names with no raw home
  and about 26 more filed under a different area than the module they came from.
  Those names moved to the area that owns them, and three areas were published as
  new entry points rather than left on a root that is going away — `./types` (the
  shared type surface, the largest single destination), `./state` and
  `./classification`.

  `./classification` is one door onto one subject: what a value is and how it must
  be handled. Its three halves would each have been an entry point — the brands
  and manifest types, the stored-form helpers (`hashToken`, `unsafeAsSealed` and
  friends), and `SecretValue` — split by whether a name happens to be a type or a
  value, which is the same defect as the facades. The duration and versioned-id
  helpers went to `./utils`, which already published, and `PikkuRequest` went to
  `./function`: it is the transport-agnostic request base, not an HTTP one — HTTP
  has `PikkuHTTPAbstractRequest`, and the only thing outside core that extends
  `PikkuRequest` is Azure's timer request.

  `./types` inherited the root barrel's habit before it inherited its contents, so
  the names with an owner elsewhere were moved off it. The middleware types and the
  five middleware factories — `pikkuMiddleware`, `pikkuMiddlewareFactory`,
  `pikkuChannelMiddleware`, `pikkuChannelMiddlewareFactory` and
  `pikkuAgentMiddleware`, runtime values on a types entry point — are now
  `@pikku/core/middleware`; the function meta types are `@pikku/core/function`;
  `SerializedError` is `@pikku/core/errors`; and the generic TypeScript helpers
  (`MakeRequired`, `PickRequired`, `PickOptional`, `RequireAtLeastOne`,
  `JSONPrimitive`, `JSONValue`) are `@pikku/core/utils`. What is left on `./types`
  is the vocabulary the wirings share, which no single module owns.

  `pikku` was itself a root barrel — `export * from '@pikku/core'` — and
  now exports only the services it bundles.

  One module survives at the old specifier, and only for the bootstrap:
  `packages/cli` is generated by the _published_ CLI pinned in its `build.sh`, and
  that CLI still writes a bare `@pikku/core` into the files it generates for the
  CLI itself. `bootstrap-compat/root.ts` carries the eight types it names, a test
  in core fails if that list grows, and it goes when the pin moves to a CLI
  released from this branch. The adapter names the pinned CLI reaches for —
  `pikkuState` and `CreateWireServices` — are rewritten to `@pikku/core/state` and
  `@pikku/core/types` by the same `build.sh` patch pass, so no second shim is
  needed for them.

  A guard test keeps the root shut: it parses imports and rejects a bare
  `@pikku/core` rather than grepping for it, because several tests hold a user's
  file as a template literal, where `import … from '@pikku/core'` is fixture text
  rather than an import this repo makes.

  An agent scaffold a project generated under an older CLI is refreshed rather
  than left to fail: `pikku all` already deleted one importing an entry point
  `@pikku/core` no longer publishes, and the `#pikku` hub joins that list.
  Without it a project that scaffolds the agent endpoint but
  declares no agents keeps the old file forever — the generator that would rewrite
  it only runs when agents exist, and the file being present is what stops it
  being regenerated as missing.

  `pikku new addon` also wrote a tsconfig `paths` map naming only the deleted hub.
  An addon's `imports` map points into `dist`, so `paths` is what resolves
  `#pikku/<leaf>` for the addon's own source build — it now names the two leaf
  patterns, in both the addon and its test harness.

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

- 41ce2cb: Upgrade to TypeScript 6 and raise the minimum Node.js version to 22.

  All packages now build against `typescript@^6.0.3` and declare `engines.node >= 22`. Internal tooling (`ts-json-schema-generator`, `zod-to-ts`) was bumped to TypeScript 6-compatible releases.

- Updated dependencies [41ce2cb]
  - @pikku/core@0.12.44

## 0.12.5

### Patch Changes

- 66d1b4f: feat(content)!: bucket-aware ContentService with typed object args

  BREAKING CHANGE: All `ContentService` methods now take object args with a
  required `bucket` field. The interface is generic over `TBucket extends string`
  so callers can constrain bucket names to a typed union.

  Migration:

  ```ts
  // Before
  content.getUploadURL(fileKey, contentType)
  content.signContentKey(key, expiresAt)
  content.writeFile(assetKey, stream)
  content.readFile(assetKey)
  content.deleteFile(assetKey)

  // After
  content.getUploadURL({ bucket, fileKey, contentType })
  content.signContentKey({ bucket, contentKey, dateLessThan: expiresAt })
  content.writeFile({ bucket, key, stream })
  content.readFile({ bucket, key })
  content.deleteFile({ bucket, key })
  ```

  - New exported types: `SignContentKeyArgs`, `SignURLArgs`, `GetUploadURLArgs`,
    `UploadURLResult`, `BucketKeyArgs`, `WriteFileArgs`, `CopyFileArgs`.
  - `LocalContent` stores objects under `<base>/<bucket>/<key>`.
  - `S3Content` and `B2Content` treat the logical bucket as a key prefix within
    the configured underlying storage bucket.
  - `workflow-screenshot` addon takes `bucket?` / `key?` input; default bucket
    resolved from `PIKKU_WORKFLOW_SCREENSHOT_BUCKET` variable, no hardcoded
    fallback.

- Updated dependencies [18acebe]
- Updated dependencies [66d1b4f]
- Updated dependencies [3e35b99]
  - @pikku/core@0.12.20

## 0.12.4

### Patch Changes

- 912453b: Compute SHA1 content hash for server-side uploads instead of using do_not_verify. Implement time-limited signed URLs via B2's download authorization API for signContentKey and signURL.
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
