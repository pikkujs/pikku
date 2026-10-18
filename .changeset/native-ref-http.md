---
'@pikku/inspector-go': patch
---

The native inspector mounts the routes of `refHTTP('ns:contract')` (optionally with `{ basePath }`) from the addon's published HTTP contracts, as `@pikku/inspector` does; before, an app wiring an addon's routes this way got no routes from native codegen. Addon MCP tools are written with the TypeScript inspector's key order, so `pikku-mcp-wirings-meta.gen.json` is byte-identical between the engines.
