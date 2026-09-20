---
'@pikku/cloudflare': patch
'@pikku/deploy-cloudflare': patch
'@pikku/cli': patch
---

Serve MCP on a Cloudflare deploy.

An MCP unit deployed to Workers answered nothing, for three independent
reasons, and each one hid the next:

- the analyzer gave the unit `routes: []`, so the dispatcher had no route to
  send it;
- `generateGatewayEntry` emitted a bare `createCloudflareWorkerHandler` and
  dropped the `mcpJson` the CLI had already resolved for it;
- `@pikku/cloudflare` had no way to receive an MCP surface at all — its
  `createCloudflareMCPHandler` was an alias for the plain worker handler, under
  a comment saying the protocol was handled elsewhere. It wasn't.

The unit now carries the routes MCP actually needs — `POST`, `GET` and `DELETE`
on the endpoint, plus the two RFC 9728 discovery paths — the generated entry
passes its surface through, and `@pikku/cloudflare/mcp` mounts a
`PikkuMCPServer` over `createFetchHandler`, falling through to the unit's
ordinary HTTP routing for everything it does not own. A tool call now runs end
to end through the worker's `fetch`, which a test asserts rather than assumes.

MCP lives behind its own entry point so that the SDK only reaches the bundle of
a unit that serves MCP, and a unit whose surface came back empty stays an
ordinary worker rather than shipping it to answer 404s.

`setupServices` now keys its per-isolate cache by the factories that built it.
It served one unit per isolate and so never noticed, but a second unit's
factories asking for services were being handed the first unit's.

Mounting it also uncovered a latent bug in the entry generator. A path into a
dot-directory — `.pikku/mcp/mcp.gen.json` — starts with a dot without being
relative, and the generator's guard tested for `.` alone, so it emitted a bare
specifier no bundler can resolve. Nothing hit it before, because the MCP import
was the first one to point inside `.pikku` and was never emitted anyway. There
is now one helper doing this, with the guard the bootstrap import already had.

Known seam: the analyzer hardcodes `/mcp`, because it never reads the generated
`mcp.gen.json`. Pikku's own codegen never writes an `mcpPath` there, so the
route table and the mount agree today — but a project that overrides it moves
the mount without moving the routes.
