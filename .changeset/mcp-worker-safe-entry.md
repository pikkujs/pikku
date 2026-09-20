---
'@pikku/modelcontextprotocol': patch
'@pikku/cloudflare': patch
---

Split the web-standard half of `PikkuMCPServer` into `@pikku/modelcontextprotocol/fetch`

`PikkuMCPServer` imports `node:http`, `node:stream` and `node:stream/promises` at
module level for its HTTP listener and stdio entry points. `@pikku/cloudflare`'s
MCP handler imported it from the package root, so workerd resolved those eagerly
and every Worker with an MCP wiring died at publish with
`Uncaught Error: No such module "node:http"`.

The web-standard core is now `PikkuMCPFetchServer`, exported from the new
`./fetch` entry, and `PikkuMCPServer` extends it with the node-only entry points.
The Cloudflare handler imports the fetch entry. The root entry is unchanged for
node consumers.
