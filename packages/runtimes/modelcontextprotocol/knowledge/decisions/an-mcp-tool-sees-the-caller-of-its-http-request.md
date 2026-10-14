---
type: decision
title: An MCP tool sees the caller of the HTTP request it arrived on, and stdio stays anonymous
description: Each HTTP MCP call builds a server around its own request and auth info, so the app's auth middleware and the tool see the caller; stdio has neither
tags: [mcp, auth, runtime]
---

# An MCP tool sees the caller of the HTTP request it arrived on, and stdio stays anonymous

In `packages/runtimes/modelcontextprotocol/src/pikku-mcp-fetch-server.ts`, `serverFactory` (lines 162-175) builds
a server for each request. It passes `{ request: new PikkuFetchHTTPRequest(ctx.requestInfo) }` when there is a
request, and `authInfo` when there is one (lines 163-171). `createConfiguredServer` takes that value (line 122).

The doc comment at lines 114-121 says each HTTP call "gets a fresh server built around its own request, and that
request is what the runner hands the app's auth middleware". It also says stdio "has no request and stays
anonymous".

`connect` (lines 177-184) creates its server with no argument (line 181), which is the hand-wired path: the comment at lines 103-105 of the same file says `this.server` is set only for "the hand-wired transports (`connect`)".

The comment at lines 150-161 says `ctx.requestInfo` is the caller's own `Request` and `ctx.authInfo` is the verified
claims the host passed in. Either can be absent.

**What this rules out:** a tool call that arrives over HTTP being treated as anonymous because the server was built
once at startup. Stdio gets no caller and is not given one.
