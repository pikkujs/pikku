---
type: overview
title: Decisions
description: Rules chosen in @pikku/mcp-server, and what each one rules out
---

# Decisions

<!-- pikku:knowledge-index -->
- [An MCP tool sees the caller of the HTTP request it arrived on, and stdio stays anonymous](an-mcp-tool-sees-the-caller-of-its-http-request.md) — Each HTTP MCP call builds a server around its own request and auth info, so the app's auth middleware and the tool see the caller; stdio has neither
- [Node MCP runs the same fetch handler and keeps no session, so each request brings its own credentials](node-mcp-goes-through-the-fetch-handler-and-is-stateless.md) — createHTTPRequestHandler adapts the fetch handler rather than running a second dispatch path, and does not reuse credentials from an earlier session id
- [The advertised resource URL comes from the forwarded origin](the-advertised-resource-url-comes-from-the-forwarded-origin.md) — Behind a TLS-terminating proxy the server sees a plaintext request, and advertising that internal origin makes a client refuse the resource as a different one
- [The default authorization server is the resource's origin](the-default-authorization-server-is-the-resource-origin.md) — With no authorizationServers option, the discovery document names the origin of the MCP endpoint as its own authorization server, and answers the bare well-known path too
<!-- /pikku:knowledge-index -->
