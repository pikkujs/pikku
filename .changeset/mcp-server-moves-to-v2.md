---
'@pikku/modelcontextprotocol': patch
---

The MCP runtime moves to `@modelcontextprotocol/server` v2

v1's monolithic `@modelcontextprotocol/sdk` is replaced by the v2 server
package, and the hand-rolled per-request transport wiring by its
`createMcpHandler` entry. Request handlers are now registered by method name
(`'tools/call'`) rather than by schema object, and stdio is served through
`serveStdio`.

Both protocol eras are served from pikku's single tool registration: 2026-07-28
clients take the modern path, and everything older — including every v1 client
— is answered by the stateless legacy fallback.

`createFetchHandler`'s handler now takes an optional second argument carrying
verified `authInfo`, which reaches MCP request handlers as `ctx.http.authInfo`.
It is strictly pass-through: the entry never derives it from request headers.
