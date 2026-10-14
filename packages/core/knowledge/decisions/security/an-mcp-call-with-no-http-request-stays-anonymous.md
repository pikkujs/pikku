---
type: decision
title: An MCP call with no HTTP request stays anonymous by transport design
description: MCP calls that arrive without an HTTP request, such as stdio, reach the function with no session because auth middleware reads the session only from the request
tags: core, mcp, auth, transport
---

# An MCP call with no HTTP request stays anonymous by transport design

`RunMCPEndpointParams.http` in `packages/core/src/wirings/mcp/mcp-runner.ts` is the HTTP request an MCP call arrived on (`mcp-runner.ts:39-41`, field at `:52`).

The comment gives the mechanism. Auth middleware reads the session off `wire.http.request`, and every implementation returns early when there is no request (`mcp-runner.ts:42-46`). Without the request, an MCP call reaches the function unauthenticated whatever middleware is registered (`mcp-runner.ts:43-46`).

The field is left undefined for transports with no request, such as stdio. The comment says those calls remain anonymous, and that this is a property of the transport rather than a default chosen in the runner (`mcp-runner.ts:48-50`).

The surrounding decision about sessionless MCP entry points is in [MCP resources, tools and prompts take sessionless functions](mcp-resources-tools-and-prompts-take-sessionless-functions.md). The refusal for an HTTP call that needs a session is in [an MCP refusal is decided before dispatch](an-mcp-refusal-is-decided-before-dispatch.md).

**What this rules out:** treating a request-less MCP call as carrying a session, and filling in a fake HTTP request to make middleware run for a stdio caller.
