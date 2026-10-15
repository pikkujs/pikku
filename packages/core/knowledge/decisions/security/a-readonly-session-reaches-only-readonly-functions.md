---
type: decision
title: A readonly session reaches only functions declared readonly
description: A session flagged readonly is refused by every function not declared readonly, checked straight after the session is required and before scopes
tags: core, auth, function-runner
---

# A readonly session reaches only functions declared readonly

`CoreUserSession.readonly` (`packages/core/src/types/core.types.ts`) restricts a
session to functions declared `readonly`. In `runPikkuFunc`
(`packages/core/src/function/function-runner.ts`) the check is
`if (session?.readonly && !funcMeta.readonly) throw new ReadonlySessionError()`.
It runs after the missing-session check and before scopes, permissions and input
validation, so a readonly session is refused before any work is done for a
mutating function. The unit test "should reject readonly sessions for
non-readonly functions" in `function-runner.test.ts` pins the behaviour.

Core never sets the flag. Whoever builds the session decides it, and core only
enforces it. Readonly is a property of the session, not of a scope, so a scope
grant cannot widen what a readonly session may reach.

**What this rules out:** expressing read-only access as a scope the session
happens to lack, and letting a readonly session call a mutating function on the
grounds that its scopes cover it.
