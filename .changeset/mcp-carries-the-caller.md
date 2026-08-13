---
'@pikku/core': patch
'@pikku/modelcontextprotocol': patch
'@pikku/cli': patch
---

MCP calls now carry the caller's HTTP request, so an MCP tool can require a session.

Every auth middleware opens with `if (!http?.request) return`. The MCP runner
never put an `http` on the wire, so all of them bailed on their first line and
an MCP call reached the function with no session — no cookie, no bearer token,
no API key, whatever the app had registered. A tool fronting a session-requiring
`pikkuFunc` could therefore only ever answer `Authentication required`, and a
tool fronting a sessionless one was callable by anyone who could reach the mount.

Almost nothing was missing. Global middleware already ran for MCP wirings, and
the runner already built a `PikkuSessionService` and the middleware session wire
props. Only the request was being dropped — twice: `RunMCPEndpointParams` had
nowhere to put one, and `createFetchHandler` received the caller's `Request` and
discarded it.

`RunMCPEndpointParams` gains an optional `http`, which the runner places on the
wire, and the fetch handler wraps the incoming `Request` in a
`PikkuFetchHTTPRequest` and threads it through tools, resources and prompts. The
request is cloned before wrapping, because the MCP transport reads the body and
both would otherwise compete for one single-use stream; only headers and cookies
are wanted, since a tool's input arrives in the JSON-RPC params.

Transports with no request to offer — stdio, and the long-lived stdio/SSE server
paths — pass nothing and stay anonymous. That is a property of those transports
rather than a default chosen here, and it is now visible in the type.

The generated auth middleware moves from `addHTTPMiddleware('*')` to
`addGlobalMiddleware`. Carrying the request is necessary but not sufficient:
session middleware registered as HTTP middleware runs for HTTP wirings only, so
an MCP call still met no middleware and still had no session. Both entries —
the Better Auth session and the console bearer token — resolve a session from
whatever request the call arrived on, which is not an HTTP routing concern.
Wirings with no request are unaffected, since each middleware returns
immediately without one.

That move also retires a hazard the old shape carried: the two entries had to
share a single `addHTTPMiddleware('*')` call because the inspector keys
route-middleware groups by pattern, so a second `'*'` registration from another
file would silently displace the first. Global middleware is an append-only
list.

**Regenerate the auth scaffold after upgrading** — an app still carrying the
`addHTTPMiddleware('*')` form keeps anonymous MCP calls.

Two consequences worth planning for:

- **A tool fronting a session-requiring function starts working.** It previously
  could not run at all.
- **A tool fronting a sessionless function is unchanged and still anonymous.**
  Scopes and permissions now apply to MCP calls exactly as they do elsewhere, so
  audit any tool that mutates state and give it the scope its HTTP sibling has.

`PikkuHTTP` is now exported from `@pikku/core/http`; it is part of this contract
and was previously only reachable as a type on other exported shapes.
