# @pikku/node-http-server

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
