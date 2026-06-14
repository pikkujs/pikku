---
'@pikku/node-http-server': patch
---

Make the MCP mount path configurable via the `mcpPath` option (default `/mcp`) and route to the MCP handler only on an exact `/mcp` path boundary instead of any `/mcp`-prefixed path.
