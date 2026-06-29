# @pikku/deploy-standalone

## 0.12.5

### Patch Changes

- 04604fa: Mount /mcp in generated server/standalone entries when the unit has a non-empty mcp.gen.json. Previously only the dev server (`tsx src/server.ts`) mounted MCP; the deployed bundle (`pikku deploy plan`) never imported mcp.gen.json or passed `mcpJson` to `PikkuNodeHTTPServer`, so MCP tools/resources/prompts silently never served in production or standalone runtimes.

## 0.12.4

### Patch Changes

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

## 0.12.3

### Patch Changes

- 9060165: Fix `@pikku/addon-graph` package exports so generated bootstrap files can be imported correctly. The Node.js HTTP server adapter is unified across dev, standalone, and container deployments. Next.js gains a worker-RPC transport. Date values in fetch responses now deserialise correctly.

## 0.12.2

### Patch Changes

- 5c98fd1: Switch standalone deploy from uWebSockets.js to Express + ws
  - Replace PikkuUWSServer with PikkuExpressServer in generated entry
  - Add WebSocket support via ws + pikkuWebsocketHandler
  - Remove pkg binary compilation — ship bundle.js directly
  - Remove native module (uws .node) handling
  - Add loadSchemas: false to avoid global state resolution issues
  - Add getHttpServer() to PikkuExpressServer for ws attachment

## 0.12.1

### Patch Changes

- 9104b68: Switch standalone deploy from uWebSockets.js to Express + ws
  - Replace PikkuUWSServer with PikkuExpressServer in generated entry
  - Add WebSocket support via ws + pikkuWebsocketHandler
  - Remove pkg binary compilation — ship bundle.js directly
  - Remove native module (uws .node) handling
  - Add loadSchemas: false to avoid global state resolution issues
  - Add getHttpServer() to PikkuExpressServer for ws attachment
