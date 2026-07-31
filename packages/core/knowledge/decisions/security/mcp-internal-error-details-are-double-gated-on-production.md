---
type: decision
title: MCP internal error details are double-gated on production
description: exposeErrors is checked again against isProduction() at throw time so an explicit true cannot leak stack traces from a production build
tags: mcp
---

# MCP internal error details are double-gated on production

`RunMCPEndpointParams.exposeErrors` in
`packages/core/src/wirings/mcp/mcp-runner.ts` defaults to `!isProduction()`, and
`runMCPPikkuFunc` checks `exposeErrors && !isProduction()` *again* when building
the `-32603` internal-error response that carries `{ message, stack }`. The
second check looks redundant against the default — it is not. The default only
applies when the caller omits the option; a caller that passes
`exposeErrors: true` explicitly would otherwise put the raw exception message and
stack trace into a JSON-RPC response served from production.

Internal errors reaching that branch are by definition unmapped — no `mcpCode` —
so their message is whatever the underlying failure produced: a database error, a
file path, a credential in a connection string. MCP responses go to a model
client, so anything in `data` is exfiltrated into a transcript.

**What this rules out:** collapsing `exposeErrors && !isProduction()` to
`exposeErrors` on the grounds that the default already handles production, and
adding any other MCP error path that serializes `e.message` or `e.stack` without
its own `isProduction()` guard.
