# @pikku/bun-server

## 0.12.10

### Patch Changes

- 80eb5c0: Generate a desktop shell from `pikku deploy apply --desktop`

  `pikku deploy apply --provider standalone --runtime bun --desktop` now emits a
  `src-tauri/` crate that ships the compiled binary as a sidecar and opens a
  window on the server's own HTTP origin, so cookies, CORS and OAuth behave
  exactly as they do in a browser. Regeneration is idempotent and leaves an
  edited file alone rather than overwriting it.

  `--desktop-url https://app.example.com` builds the other shape: a shell that
  points at an already-deployed server. Nothing is bundled — no sidecar, no
  binary, and so no bun runtime to compile one — and the window is declared in
  `tauri.conf.json` rather than opened from Rust, because the origin is known up
  front. The url can also live in `pikku.config.json` as `deploy.desktop.url`,
  alongside `deploy.desktop.identifier`.

  Supporting changes: `SERVER_READY_MARKER` moved to `@pikku/deploy` (the CLI
  re-exports it from its old path), both HTTP runtimes expose the port they
  actually bound so `--port 0` reports a real port, and the generated server
  entry exits when its parent process goes away.

- 80eb5c0: feat: serve a built frontend from the pikku server's own origin

  A new `frontend` key in `pikku.config.json` names a directory of built
  frontend output. `pikku serve` mounts it, and `pikku deploy` ships it inside
  the distributable — into a directory beside the bundle for the node runtime,
  and embedded in the binary for a `bun build --compile` standalone. `pikku dev`
  deliberately ignores it and says so, because the frontend's own dev server owns
  that job.

  Pikku reads the frontend's output and never builds it, so an unbuilt directory
  fails with a message that says which build to run rather than booting a server
  that answers every page with a 404.

- Updated dependencies [80eb5c0]
- Updated dependencies [80eb5c0]
  - @pikku/core@0.12.98

## 0.12.9

### Patch Changes

- 6ff72d3: Raise the supported Bun version to 1.4.

  `@pikku/bun-server` and `@pikku/kysely-bun-sqlite` now declare `engines.bun: >=1.4.0`
  and build against `@types/bun@^1.4.0`. `create-pikku` scaffolds
  `"packageManager": "bun@1.4.0"`, and the fabric `smoke`/`validate` commands default to
  and recommend the same version. CI pins `oven-sh/setup-bun` to 1.4.0 instead of
  tracking `latest`.

## 0.12.8

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
  - @pikku/modelcontextprotocol@0.12.10

## 0.12.7

### Patch Changes

- 6794681: Publish the ecosystem surface as per-area sub-barrels under `@pikku/core/ecosystem/*`, and point generated code, the CLI, the inspector and the runtime adapters at them.

  348 names that only generated code, the toolchain or a runtime adapter ever imports now have a second home on `@pikku/core/ecosystem/<area>` — one sub-barrel per area, matching how core already publishes its entrypoints, so no single barrel grows without bound and a consumer only pulls in the area it uses.

  This step is additive: every name is still exported from the entrypoint it was published from before, so nothing downstream breaks. Removing them from the app-facing barrels is a later change, and needs a release carrying `./ecosystem/*` first.

- Updated dependencies [7406bfe]
- Updated dependencies [6794681]
  - @pikku/core@0.12.84
  - @pikku/modelcontextprotocol@0.12.9

## 0.12.6

### Patch Changes

- fd9d834: Stop publishing internals that only their own package or file used. The declarations stay; only the entrypoint re-export is removed, so nothing that imported a name from where it is declared is affected.
- Updated dependencies [063f43a]
- Updated dependencies [ce66bf8]
- Updated dependencies [d0307a8]
- Updated dependencies [ce66bf8]
- Updated dependencies [ce66bf8]
- Updated dependencies [3ad2131]
- Updated dependencies [b930dca]
- Updated dependencies [b95e77d]
- Updated dependencies [fd9d834]
- Updated dependencies [8978fbd]
  - @pikku/core@0.12.82
  - @pikku/modelcontextprotocol@0.12.8

## 0.12.5

### Patch Changes

- ea8aabf: Serve `LocalContent` uploads and signed reads under Bun.

  `LocalContent` hands the browser a `PUT <uploadUrlPrefix>/<key>` upload URL and a signed
  `GET <assetUrlPrefix>/<key>` read URL, but it is a `ContentService` and cannot answer
  either — something in the serving path has to. Only `@pikku/node-http-server` did. The
  same project served under Bun handed out upload URLs that 404ed, with nothing naming the
  cause: the config was accepted, the service was constructed, and the URLs looked right.

  `@pikku/core` now exports `createLocalContentRequestHandler` from
  `@pikku/core/services/local-content-request-handler` — the server half of `LocalContent`,
  expressed in Web `Request`/`Response` so every runtime shares one implementation of the
  signature check rather than each re-deriving it. It returns `null` for anything that is
  not a content request, which is the caller's signal to carry on with its normal routing.

  `PikkuBunServer` accepts `config.content` and a `contentSigningJWT` option, mirroring
  `PikkuNodeHTTPServer`, and answers both prefixes ahead of static mounts and routing.
  `BunServerRunner` was dropping `contentSigningJWT` on the floor, which silently disabled
  signed asset reads for every Bun project even once the prefixes were served — the config
  arrived, the service that verifies its signatures did not.

  Signed reads are refused unless every claim matches, the path included: without that, a
  signature minted for one asset would read any other.

- Updated dependencies [32277d5]
- Updated dependencies [ea8aabf]
- Updated dependencies [33e96ab]
- Updated dependencies [fd72e58]
- Updated dependencies [fd72e58]
- Updated dependencies [fd72e58]
- Updated dependencies [894b2f8]
- Updated dependencies [dd19aa7]
- Updated dependencies [50ec500]
  - @pikku/core@0.12.75

## 0.12.4

### Patch Changes

- d4a2503: Serve the console same-origin at /console (#861). Both dev servers gain
  `staticMounts` (prefix → directory static serving with SPA fallback and path
  traversal protection); `pikku serve` / `pikku dev` mount the bundled console
  app at `/console` on the API port whenever it is bundled, so auth cookies are
  first-party and no `?server=` param is needed. The console is built with
  `base: '/console/'` (its router already derives the basename from BASE_URL).
  The separate `--console <port>` static server is removed; `pikku console`
  serves the bundle under /console and redirects the root there.
- Updated dependencies [61c9ce9]
- Updated dependencies [f1f39f8]
- Updated dependencies [c45e98d]
- Updated dependencies [472a349]
  - @pikku/core@0.12.52

## 0.12.3

### Patch Changes

- 6f6abfe: Mount MCP on the bun runtime. `@pikku/bun-server` now accepts `mcpJson`/`mcpPath`
  options and serves the MCP endpoint (default `/mcp`) via a new fetch-native
  handler on `PikkuMCPServer.createFetchHandler()`, which uses the MCP SDK's
  Web-Standard (`Request`→`Response`) streamable-HTTP transport — no `node:http`
  req/res. The standalone `--runtime bun` entry now wires the same `mcpImport` +
  `mcpJson` option the node entry already used, so a bun standalone build serves
  `/mcp` with the project's tools/resources/prompts instead of silently dropping
  them. `@pikku/modelcontextprotocol` is an optional peer dep of `@pikku/bun-server`
  (only imported when `mcpJson` is non-empty).
- Updated dependencies [6f6abfe]
  - @pikku/modelcontextprotocol@0.12.6

## 0.12.2

### Patch Changes

- 41ce2cb: Upgrade to TypeScript 6 and raise the minimum Node.js version to 22.

  All packages now build against `typescript@^6.0.3` and declare `engines.node >= 22`. Internal tooling (`ts-json-schema-generator`, `zod-to-ts`) was bumped to TypeScript 6-compatible releases.

- Updated dependencies [41ce2cb]
  - @pikku/core@0.12.44

## 0.12.1

### Patch Changes

- d5c3c85: feat: bun first-class support — new `@pikku/bun-server` runtime and `@pikku/kysely-bun-sqlite` dialect, bun template, CI matrix with `package-manager: [yarn, bun]`, and bun verifier.
- e443e94: feat(deploy): standalone provider can target the bun runtime

  `pikku deploy plan|apply --provider standalone --runtime bun` now generates a
  `@pikku/bun-server` entry (native `Bun.serve` WebSockets, no `ws` package) and
  compiles the bundle into a single self-contained executable via
  `bun build --compile` — no runtime needed on the target host. The default
  remains `--runtime node`, which is unchanged (ships `bundle.js`, run with
  `node bundle.js`).

  `PikkuBunServer` now accepts an injectable `eventHub` in its options. Inject the
  same `BunEventHubService` you pass to `createSingletonServices` so functions and
  the WebSocket transport share one hub — otherwise a function's
  `eventHub.publish(...)` targets a different hub than the one holding the live
  sockets and broadcasts never reach connected clients. The standalone bun entry
  and the `bun` template now wire this shared hub, fixing cross-connection /
  cross-transport channel pub-sub on bun.

  Also removes the unused `@yao-pkg/pkg` dependency and its stale type shim from
  `@pikku/deploy-standalone` (the pkg-based binary path was dropped in #489).

- Updated dependencies [92cd5b1]
  - @pikku/core@0.12.38
