---
type: decision
title: Node MCP runs the same fetch handler and keeps no session, so each request brings its own credentials
description: createHTTPRequestHandler adapts the fetch handler rather than running a second dispatch path, and does not reuse credentials from an earlier session id
tags: [mcp, node, auth]
---

# Node MCP runs the same fetch handler and keeps no session, so each request brings its own credentials

`createHTTPRequestHandler` in `packages/runtimes/modelcontextprotocol/src/pikku-mcp-server.ts` (lines 112-120) calls
`createFetchHandler(options)` and wraps it for Node requests.

The doc comment (lines 102-111) says a second dispatch path "would only be a second place for the two runtimes to
disagree", and that node MCP calls had once run "without the caller's request while fetch ones carried it". It says
node is stateless "because each request brings its own credentials rather than inheriting them from whoever opened a
session id".

The per-request server that makes this work is `serverFactory` in `pikku-mcp-fetch-server.ts` (lines 162-175), which
the comment at line 190 describes as "a fresh server per request".

**What this rules out:** a Node MCP request reusing the credentials of the session id that opened the connection.
