---
'@pikku/cli': patch
---

`pikku dev` now serves MCP.

The dev server has always logged how many MCP endpoints an app declares, and
both transports have always known how to mount them — but `dev` never handed
one the generated manifest, so `mcpJson` was undefined and `initMCP` returned
before mounting anything. Every app with MCP wirings announced a surface at
startup and answered 404 on `/mcp`, and the only way to exercise a tool was to
deploy. `deploy-apply` carries a comment describing the deployed bundle as
matching "the dev server", which had never served it either.

The manifest goes to the transport through the runner's *options*, not through
its config. `PikkuBunServer` and `PikkuNodeHTTPServer` both read `mcpJson` off
their third argument, and the runners forward a hand-picked set of fields — so
a value placed in `config` type-checks, arrives nowhere, and mounts nothing
without an error. `DevServerOptions` now carries `mcpJson` and both runners
forward it, which is the same shape `contentSigningJWT` already needed.

Reading the manifest is best-effort: an app with no MCP wirings has no
`mcp.gen.json` and mounts nothing, and an unparseable one warns rather than
failing the dev server.

This also makes MCP tools testable. They are not reachable over RPC — the
generated type union offers their names, but the runtime serves only
`expose: true` functions — so before this change an MCP tool could not be
invoked by a scenario, a browser or an MCP client without a deploy.

**Note on auth.** An MCP call over HTTP carries the caller's request, so the
app's own session middleware runs and a tool fronting a session-requiring
function is authenticated like any other wiring. Two cases still reach a
function anonymously, and mounting `/mcp` in dev makes them visible rather than
introducing them:

- **A requestless transport.** Stdio has no request to derive a session from, so
  everything it serves runs anonymous.
- **A tool fronting a sessionless function.** It requires no session by
  construction, so it is callable by anything that can reach the mount — a
  mutating one included. Give it the scope its HTTP sibling has, and protect the
  mount at the transport where the surface is not meant to be public.
