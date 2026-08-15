## 0.12.9

### Patch Changes

- 6794681: Publish the ecosystem surface as per-area sub-barrels under `@pikku/core/ecosystem/*`, and point generated code, the CLI, the inspector and the runtime adapters at them.

  348 names that only generated code, the toolchain or a runtime adapter ever imports now have a second home on `@pikku/core/ecosystem/<area>` — one sub-barrel per area, matching how core already publishes its entrypoints, so no single barrel grows without bound and a consumer only pulls in the area it uses.

  This step is additive: every name is still exported from the entrypoint it was published from before, so nothing downstream breaks. Removing them from the app-facing barrels is a later change, and needs a release carrying `./ecosystem/*` first.

- Updated dependencies [7406bfe]
- Updated dependencies [6794681]
  - @pikku/core@0.12.84

## 0.12.8

### Patch Changes

- ce66bf8: MCP calls now carry the caller's HTTP request, so an MCP tool can require a session.

  Every auth middleware opens with `if (!http?.request) return`. The MCP runner
  never put an `http` on the wire, so all of them bailed on their first line and
  an MCP call reached the function with no session — no cookie, no bearer token,
  no API key, whatever the app had registered. A tool fronting a session-requiring
  `pikkuFunc` could therefore only ever answer `Authentication required`, and a
  tool fronting a sessionless one was callable by anyone who could reach the mount.

  Almost nothing was missing. Global middleware already ran for MCP wirings, and
  the runner already built a `PikkuSessionService` and the middleware session wire
  props. Only the request was being dropped — twice: `RunMCPEndpointParams` had
  nowhere to put one, and `createFetchHandler` received the caller's `Request` and
  discarded it.

  `RunMCPEndpointParams` gains an optional `http`, which the runner places on the
  wire, and the fetch handler wraps the incoming `Request` in a
  `PikkuFetchHTTPRequest` and threads it through tools, resources and prompts. The
  request is cloned before wrapping, because the MCP transport reads the body and
  both would otherwise compete for one single-use stream; only headers and cookies
  are wanted, since a tool's input arrives in the JSON-RPC params.

  Transports with no request to offer — stdio, and the long-lived stdio/SSE server
  paths — pass nothing and stay anonymous. That is a property of those transports
  rather than a default chosen here, and it is now visible in the type.

  The generated auth middleware moves from `addHTTPMiddleware('*')` to
  `addGlobalMiddleware`. Carrying the request is necessary but not sufficient:
  session middleware registered as HTTP middleware runs for HTTP wirings only, so
  an MCP call still met no middleware and still had no session. Both entries —
  the Better Auth session and the console bearer token — resolve a session from
  whatever request the call arrived on, which is not an HTTP routing concern.
  Wirings with no request are unaffected, since each middleware returns
  immediately without one.

  That move also retires a hazard the old shape carried: the two entries had to
  share a single `addHTTPMiddleware('*')` call because the inspector keys
  route-middleware groups by pattern, so a second `'*'` registration from another
  file would silently displace the first. Global middleware is an append-only
  list.

  **Regenerate the auth scaffold after upgrading** — an app still carrying the
  `addHTTPMiddleware('*')` form keeps anonymous MCP calls.

  Two consequences worth planning for:
  - **A tool fronting a session-requiring function starts working.** It previously
    could not run at all.
  - **A tool fronting a sessionless function is unchanged and still anonymous.**
    Scopes and permissions now apply to MCP calls exactly as they do elsewhere, so
    audit any tool that mutates state and give it the scope its HTTP sibling has.

  `PikkuHTTP` is now exported from `@pikku/core/http`; it is part of this contract
  and was previously only reachable as a type on other exported shapes.

- ce66bf8: The node MCP handler is now an adapter over the fetch one, on SDK 1.30.

  `createHTTPRequestHandler` kept its own dispatch: a session map, a hand-rolled
  body reader, an `isInitializeRequest` gate, and a `StreamableHTTPServerTransport`
  per MCP session. `createFetchHandler` did none of that and built a fresh server
  per request. Two paths, and they disagreed about the thing that matters — the
  fetch one handed the caller's `Request` to the runner and the node one handed it
  nothing, so an MCP tool that required a session worked over one transport and
  answered `Authentication required` over the other, for the same app.

  The node handler now converts the `IncomingMessage` to a `Request`, calls the
  fetch handler, and writes the `Response` back out. Its signature is unchanged,
  so `PikkuNodeHTTPServer` and `connectHTTP` are untouched. The body is streamed
  in both directions rather than buffered, so a large `tools/call` payload is not
  held whole and an SSE response reaches the client as it is produced.

  This follows the SDK. `@modelcontextprotocol/sdk` moves 1.27.1 → 1.30.0, where
  the node `StreamableHTTPServerTransport` is itself documented as a thin wrapper
  around `WebStandardStreamableHTTPServerTransport` — keeping a second dispatch
  above a shared transport only bought a second place for the runtimes to diverge.

  **Node MCP is now stateless.** There is no `mcp-session-id` continuity: each
  request is served on its own transport and brings its own credentials, rather
  than inheriting whatever authenticated the `initialize` that opened a session id.
  This is what the fetch transports have always done, and it is the shape a
  serverless deploy can actually hold.

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

## 0.12.7

### Patch Changes

- daec082: Drop Node 22 support — the minimum supported runtime is now Node 24 (LTS).

  Node 22 deadlocks `pikku dev` at `loadUserBootstrap` (tsx `register()` + `require(esm)` cycle handling on node 22.12+), and Node 20 is already below our floor. The `engines.node` requirement is raised to `>=24` across all packages, matching `.nvmrc` and the CI test matrix. Closes #751.

- Updated dependencies [7b17b14]
- Updated dependencies [daec082]
- Updated dependencies [e0fd352]
  - @pikku/core@0.12.58

## 0.12.6

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

## 0.12.5

### Patch Changes

- 41ce2cb: Upgrade to TypeScript 6 and raise the minimum Node.js version to 22.

  All packages now build against `typescript@^6.0.3` and declare `engines.node >= 22`. Internal tooling (`ts-json-schema-generator`, `zod-to-ts`) was bumped to TypeScript 6-compatible releases.

- Updated dependencies [41ce2cb]
  - @pikku/core@0.12.44

## 0.12.0

## 0.12.4

### Patch Changes

- a2ee6d0: Return generic error message to MCP clients instead of leaking internal error details.
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

## 0.12.3

### Patch Changes

- 4ef2db4: Add Streamable HTTP transport support to PikkuMCPServer with connectStdio(), createHTTPRequestHandler(), and connectHTTP() convenience methods
- Updated dependencies [387b2ee]
- Updated dependencies [32ed003]
- Updated dependencies [7d369f3]
- Updated dependencies [508a796]
- Updated dependencies [ffe83af]
- Updated dependencies [c7ff141]
  - @pikku/core@0.12.3

## 0.12.2

### Patch Changes

- 3e04565: chore: update dependencies to latest minor/patch versions
- Updated dependencies [cc4c9e9]
- Updated dependencies [3e04565]
  - @pikku/core@0.12.2

## 0.12.1

### Patch Changes

- e04531f: Code quality improvements: resolve oxlint warnings and apply autofixes across the codebase (unused bindings, unnecessary constructors, prefer `const` over `let`, etc.). No behaviour changes.
- Updated dependencies [62a8725]
- Updated dependencies [a3bdb0d]
- Updated dependencies [e0349ff]
- Updated dependencies [62a8725]
- Updated dependencies [e04531f]
- Updated dependencies [62a8725]
- Updated dependencies [a83efb8]
- Updated dependencies [8eed717]
- Updated dependencies [62a8725]
- Updated dependencies [62a8725]
- Updated dependencies [62a8725]
  - @pikku/core@0.12.1

- Updated dependencies

## 0.11.0

## 0.11.1

### Patch Changes

- 4b811db: chore: updating all dependencies
- ce902b1: fix: fixing mcp version since it introduced lots of breaking changes
- 06e1a31: breaking: change session services to wire services
- Updated dependencies [4b811db]
- Updated dependencies [e12a00c]
- Updated dependencies [4579434]
- Updated dependencies [28aeb7f]
- Updated dependencies [ce902b1]
- Updated dependencies [06e1a31]
  - @pikku/core@0.11.1

### Minor Changes

- Workflow support

# @pikku/mcp-server

## 0.10.1

### Patch Changes

- 730adb6: Update runtime adapters for channel middleware support

  **Updates:**
  - Update Cloudflare hibernation WebSocket server for middleware changes
  - Update Fastify response convertor for improved channel handling
  - Update MCP server for channel middleware support
  - Update Next.js runtime adapter for channel improvements

- Updated dependencies [ea652dc]
- Updated dependencies [4349ec5]
- Updated dependencies [44d71a8]
  - @pikku/core@0.10.2

## 0.10.0

This release includes significant improvements across the framework including tree-shaking support, middleware/permission factories, enhanced CLI functionality, improved TypeScript type safety, and comprehensive test strategies.

For complete details, see https://pikku.dev/changelogs/0_10_0.md

## 0.9.3-next.0

### Patch Changes

- Updated dependencies
  - @pikku/core@0.9.12-next.0

## 0.9.2

### Patch Changes

- a5905a9: chore: updating all dependencies
- Updated dependencies [1256238]
- Updated dependencies [6cf8efd]
- Updated dependencies [d3a9a09]
- Updated dependencies [840e078]
- Updated dependencies [667d23c]
- Updated dependencies [a5905a9]
  - @pikku/core@0.9.2

## 0.9.1

### Patch Changes

- fdb1593: core: bumping everything with a patch to sync up the major release inconsistencies in dependencies
- Updated dependencies [fdb1593]
  - @pikku/core@0.9.1

## 0.9.0

### Breaking Changes

- Normalized all transports to use "wirings" instead of events/routes/transports for consistency across the framework

## 0.8.2

### Patch Changes

- 0fb4b3d: refactor: mcp server expects json and not file path
- Updated dependencies [0fb4b3d]
  - @pikku/core@0.8.2

## 0.8.1

### Patch Changes

- 3261090: refactor: moving mcp endpoints into core
- Updated dependencies [3261090]
- Updated dependencies [7c592b8]
- Updated dependencies [30a082f]
  - @pikku/core@0.8.1

## 0.8.0

### Major Features

- **MCP Implementation**: Partial implementation of Model Context Protocol server runtime with resources, tools, and prompts
- **Automatic Tool Registration**: Automatic registration of tools from Pikku bootstrap files
- **Resource Management**: Support for MCP resources
- **Prompt System**: Support for prompt system integration

## 0.7.0

### Added

- Initial implementation of Pikku MCP server runtime
- Integration with official MCP SDK
- Automatic tool registration from Pikku bootstrap files
- Configurable server options (name, version, capabilities)
- Support for ListToolsRequestSchema and CallToolRequestSchema handlers
