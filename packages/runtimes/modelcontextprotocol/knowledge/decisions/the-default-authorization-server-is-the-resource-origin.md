---
type: decision
title: The default authorization server is the resource's origin
description: With no authorizationServers option, the discovery document names the origin of the MCP endpoint as its own authorization server, and answers the bare well-known path too
tags: [mcp, oauth, discovery]
---

# The default authorization server is the resource's origin

`buildMetadata` in `packages/runtimes/modelcontextprotocol/src/mcp-auth.ts` sets
`authorization_servers` to the caller's `authorizationServers` option when given
(line 99). Otherwise it uses `new URL('/', resource).href` (lines 99-101), which is
the origin of the resource URL.

The resource URL comes from `resourceUrl` (lines 67-78). It takes the first entry of
`x-forwarded-proto` and `x-forwarded-host` when present, and falls back to the
request's own URL and host. So the default is the origin the client reached, not the
internal address of a proxied request. The proxy behaviour is recorded in
[The advertised resource URL comes from the forwarded origin](the-advertised-resource-url-comes-from-the-forwarded-origin.md).

The doc comment on `MCPAuthOptions` (lines 14-20) gives the reason. The common
deployment is its own authorization server, since the app's auth mount and the MCP
endpoint share an origin. A discovery document nobody has to configure "cannot drift
from the server it describes".

`protectedResourceMetadataResponse` (lines 121-131) answers two paths: the path-aware
route named in the challenge, and the bare `/.well-known/oauth-protected-resource`
(line 129). The comment at lines 117-119 says the bare route is kept because clients
that predate path-aware discovery probe it, and a 404 there leaves them with nowhere
to go.

**What this rules out:** a discovery document that names an authorization server the
client did not reach, and a server that answers only the path-aware route.
