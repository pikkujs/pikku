---
type: decision
title: A wire with auth disabled cannot point at a pikkuFunc
description: A route or wiring with auth false that names a session-requiring pikkuFunc is reported as critical, and the function is not accepted
tags: [inspector, auth, validation]
---

# A wire with auth disabled cannot point at a pikkuFunc

`validateAuthSessionless` in `packages/inspector/src/utils/validate-auth-sessionless.ts`
resolves the wire's auth. The wire's own `auth` wins when it is a boolean; otherwise
the inherited value is used (lines 18-20).

When that resolves to `false` and the function's meta has `sessionless === false`,
the function logs `AUTH_DISABLED_REQUIRES_SESSIONLESS` as critical and returns
`false` (lines 21-27). The message tells the author to use `pikkuSessionlessFunc`
instead (line 24).

**What this rules out:** a wire that declares no session needed while its function
does need one. The check runs on the wire's auth, not on the function's own `auth`
field.
