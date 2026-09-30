---
'@pikku/cli': patch
---

`pikku validate` now fails when MCP is wired without `@pikku/modelcontextprotocol` or agents are wired without `@pikku/ai-vercel`, so deploy tooling no longer has to inject them.
