---
'@pikku/cloudflare': patch
---

`runRpc` on a Cloudflare MCP worker takes `traceparent` as its third argument, like every other worker entrypoint, and continues the caller's trace.
