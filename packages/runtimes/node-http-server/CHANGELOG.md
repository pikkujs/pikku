# @pikku/node-http-server

## 0.12.5

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

## 0.12.4

### Patch Changes

- 41ce2cb: Upgrade to TypeScript 6 and raise the minimum Node.js version to 22.

  All packages now build against `typescript@^6.0.3` and declare `engines.node >= 22`. Internal tooling (`ts-json-schema-generator`, `zod-to-ts`) was bumped to TypeScript 6-compatible releases.

- Updated dependencies [41ce2cb]
  - @pikku/core@0.12.44
  - @pikku/modelcontextprotocol@0.12.5

## 0.12.3

### Patch Changes

- e6bb2d6: feat(node-http-server): dispatch cron + queue jobs into the server-target container

  A `deploy: 'server'` unit runs in a long-lived Node container and is never
  uploaded as a CF script, so its scheduled tasks and queue workers previously
  had no way to fire — dispatch only reached CF scripts. `PikkuNodeHTTPServer`
  now mounts two authenticated dispatch routes when `dispatchJobs` is enabled:
  `POST /__pikku/scheduler-job` (`runScheduledTask`) and `POST /__pikku/queue-job`
  (`runQueueJob`), gated by a `dispatchSecret` checked with `timingSafeEqual`
  against an `x-pikku-dispatch` header. The cloudflare adapter's generated server
  entry now passes `{ dispatchJobs: true, dispatchSecret: process.env.PIKKU_DISPATCH_SECRET }`,
  so a fabric proxy can forward `/__pikku/*` dispatch to the container exactly
  like it forwards HTTP — one dispatch primitive for both runtimes.

## 0.12.2

### Patch Changes

- ccd9e27: Auto-mount the MCP server in PikkuNodeHTTPServer
- bc28e3b: Make the MCP mount path configurable via the `mcpPath` option (default `/mcp`) and route to the MCP handler only on an exact `/mcp` path boundary instead of any `/mcp`-prefixed path.
- Updated dependencies [cd101a5]
- Updated dependencies [ac16265]
- Updated dependencies [a05e864]
- Updated dependencies [20750fd]
  - @pikku/core@0.12.30

## 0.12.1

### Patch Changes

- 9060165: Fix `@pikku/addon-graph` package exports so generated bootstrap files can be imported correctly. The Node.js HTTP server adapter is unified across dev, standalone, and container deployments. Next.js gains a worker-RPC transport. Date values in fetch responses now deserialise correctly.
- Updated dependencies [9060165]
- Updated dependencies [9060165]
- Updated dependencies [9060165]
  - @pikku/core@0.12.21
