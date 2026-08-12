---
'@pikku/modelcontextprotocol': patch
---

The node MCP handler is now an adapter over the fetch one, on SDK 1.30.

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
