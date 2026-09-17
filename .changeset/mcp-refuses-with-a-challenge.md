---
'@pikku/modelcontextprotocol': patch
'@pikku/core': patch
'@pikku/bun-server': patch
'@pikku/node-http-server': patch
---

An MCP call that needs a session is refused with an OAuth challenge

A tool fronting a session-requiring function used to answer an unauthenticated
caller with `200` and `isError: true`, which a client reads as a tool that
broke rather than one it has not authenticated for — so OAuth discovery never
began. Such a call now gets `401` with a `WWW-Authenticate: Bearer` challenge
naming the resource metadata, and `/.well-known/oauth-protected-resource` is
served alongside the MCP endpoint.

The endpoint is not gated as a whole. `mcpTargetRequiresSession` reads the
declarations the runner already enforces — a `pikkuFunc` needs a session, a
`pikkuSessionlessFunc` needs one only where it says `auth: true` — so public
and private tools can share one server and only the private ones are
challenged.

`createFetchHandler` and `createHTTPRequestHandler` take an optional `auth`
describing what to advertise (`authorizationServers`, `scopesSupported`,
`resourceName`), surfaced on both servers as an `mcpAuth` option. Every field
defaults from the request, because a pikku app is usually its own
authorization server. Both handlers now also return `ownsPath`, because the
discovery document lives outside `mcpPath` and a host routing on the endpoint
alone would 404 the document its own challenge points at.
