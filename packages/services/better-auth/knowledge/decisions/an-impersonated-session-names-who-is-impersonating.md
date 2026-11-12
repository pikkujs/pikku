---
type: decision
title: An impersonated session names who is impersonating
description: resolveImpersonatedSession sets impersonated: { by } to the real caller's id after mapSession, and the tracer and logger record it as pikku.impersonated and pikku.impersonated.by
tags: better-auth, impersonation, sessions, tracing
---

# An impersonated session names who is impersonating

An impersonated session runs as the target, so its `userId` and scopes are the
target's and nothing in it said an admin was acting. A span or log line then
looked identical to the target's own traffic.

`CoreUserSession` has an optional `impersonated?: { by: string }`. `by` is the
id of the real user doing the impersonating; absent means not impersonated.
`resolveImpersonatedSession` sets it from the caller it already holds
(`caller.user.id`), after `mapSession` runs, so an app's mapper can neither
forge it nor drop it. It is set by the server on the session the middleware
builds and is never read from request input.

The function span writes `pikku.impersonated` (a boolean, `true`) and
`pikku.impersonated.by` when it opens, beside `pikku.user.id` and
`pikku.org.id`, and again at its end. Both are in the attribute allow-list and in
the logger's `CONTEXT_ATTRIBUTES`, so a log line written inside the span carries
them. A normal session has neither attribute: there is no `false` to write.

Not decided here: with no `mapSession` the impersonated session is still just
`{ userId }` plus the marker, without the `orgId` or `virtualUser` a normal
session gets. An app that wants them returns them from `mapSession`.

**What this rules out:** reading `impersonated` from a header, cookie or token
the client controls, and an impersonated request that is indistinguishable from
the target's own.
