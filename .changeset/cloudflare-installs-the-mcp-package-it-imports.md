---
'@pikku/cloudflare': patch
---

`@pikku/cloudflare` installs the MCP package it imports.

`mcp-handler.ts` imports `PikkuMCPServer` from `@pikku/modelcontextprotocol`, which the package declared as a peer dependency and nothing else. A peer is a requirement placed on the consumer, not an instruction to install anything here, so the workspace never linked it and the package's own build could not resolve the import — `TS2307` on a module that builds fine two packages over. The release stopped there and took every package queued behind it with it.

The two sibling runtimes that also serve MCP, `node-http-server` and `bun-server`, each declare it twice: peer for the consumer, dev so the build has it. This matches them. Nothing about what a consumer must install changes.
