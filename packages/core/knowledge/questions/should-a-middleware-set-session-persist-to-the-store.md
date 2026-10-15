---
type: question
title: Should a session set by middleware be persisted and re-issued like a function's?
description: Middleware setSession calls setInitial, which marks no change and writes no store entry, while a function's setSession does both; the reason is not recorded
tags: core, auth, session
---

# Should a session set by middleware be persisted and re-issued like a function's?

Two wire helpers in `packages/core/src/services/user-session-service.ts` set the
session differently. `createMiddlewareSessionWireProps` and the HTTP runner's
middleware wire (`packages/core/src/wirings/http/http-runner.ts`) bind
`setSession` to `setInitial`. That sets the session without marking
`sessionChanged` and without calling the session store. `createFunctionSessionWireProps`
binds `setSession` to `set`, which marks the change and writes the store.

The effect is that a session established by `authBearer`, `authAPIKey` or
`authCookie` is never written to the store and never triggers a cookie
re-issue in `authCookie`, which checks `hasSessionChanged`. A function that calls
`setSession` does both. The naming suggests the middleware path is meant to
describe the request's starting session, but no comment, test or note says so.

What is asked: is it intended that a middleware-authenticated session stays
request-scoped, or should middleware-set sessions reach the store like function-set
ones?
