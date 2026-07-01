---
'@pikku/modelcontextprotocol': patch
'@pikku/bun-server': patch
'@pikku/deploy-standalone': patch
---

Mount MCP on the bun runtime. `@pikku/bun-server` now accepts `mcpJson`/`mcpPath`
options and serves the MCP endpoint (default `/mcp`) via a new fetch-native
handler on `PikkuMCPServer.createFetchHandler()`, which uses the MCP SDK's
Web-Standard (`Request`→`Response`) streamable-HTTP transport — no `node:http`
req/res. The standalone `--runtime bun` entry now wires the same `mcpImport` +
`mcpJson` option the node entry already used, so a bun standalone build serves
`/mcp` with the project's tools/resources/prompts instead of silently dropping
them. `@pikku/modelcontextprotocol` is an optional peer dep of `@pikku/bun-server`
(only imported when `mcpJson` is non-empty).
