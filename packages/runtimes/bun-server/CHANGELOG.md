# @pikku/bun-server

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
