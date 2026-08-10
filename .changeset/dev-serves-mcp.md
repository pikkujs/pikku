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

**Note on auth.** MCP tools run with no user session. `runMCPTool` is called
with `{ mcp }` alone, so no cookie, header or session reaches the tool, and
every declared tool is callable by anything that can reach the mount — a
mutating tool included. That was equally true of a deployed app before this
change; mounting the endpoint in dev makes it visible rather than making it so.
Treat `/mcp` as an unauthenticated surface and protect it at the transport, and
prefer read-only tools until per-tool auth exists.
