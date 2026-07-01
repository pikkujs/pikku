# @pikku/bun-server

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
