---
type: decision
title: An operator sign-in that does not resolve the persona to a user is refused
description: establishOperatorSession throws when the target returns no actAs.userId, so an operator never silently acts as itself when the persona cannot be resolved
tags: core, personas, sign-in
---

# An operator sign-in that does not resolve the persona to a user is refused

`establishOperatorSession` in `packages/core/src/services/persona-sign-in.ts`
posts an operator token with `actAs: { email }` and needs two things back: a
session cookie, and `actAs.userId`. The second is what the impersonation header
names on every later request, and the function throws when it is absent. The
message says the target is probably running a `@pikku/better-auth` too old to
resolve a user to act as.

The same function refuses a response with no `Set-Cookie`. Neither failure falls
back to the operator's own session. Without the user id, every later request
would run as the operator, which the persona's rights and the scenario's
assertions would then be measuring by mistake.

**What this rules out:** continuing a persona run whose target did not name the
user to act as, and any fallback that leaves the operator's identity in place of
the persona's.
