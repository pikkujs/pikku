---
type: decision
title: The stateless session middleware is global, not HTTP middleware
description: When cookieCache is on, the generated session middleware is registered with addGlobalMiddleware, so it runs for MCP and other non-HTTP wirings too, and passes straight through when there is no request
tags: cli, auth, middleware, sessions
---

# The stateless session middleware is global, not HTTP middleware

When `definition.cookieCache` is set, `serializeAuthGen` in
`packages/cli/src/functions/wirings/auth/serialize-auth-gen.ts` emits the session middleware
into its own file (`serialize-auth-gen.ts:350-381`). The file registers it with
`addGlobalMiddleware`, not with `addHTTPMiddleware` (`serialize-auth-gen.ts:371`,
`serialize-auth-gen.ts:374`).

The comment gives the reason. As HTTP middleware it ran for HTTP wirings alone, so an MCP tool
fronting a session-requiring function could answer only "Authentication required" however the caller
authenticated (`serialize-auth-gen.ts:355-359`).

Each entry opens with a check for a request, so queue, scheduler and CLI calls pass through
(`serialize-auth-gen.ts:361-363`). The comment also notes that global middleware is a list, so a second
registration appends rather than overwriting one keyed by route (`serialize-auth-gen.ts:365-367`).

**What this rules out:** session resolution that depends on the wiring type, and a second middleware
call that overwrites the first.
