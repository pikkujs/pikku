---
type: decision
title: auth false on a session-required function warns and still requires a session
description: Writing auth: false on a function that is not sessionless does not open it; the runner logs a warning and still throws MissingSessionError without a session
tags: core, auth, function-runner
---

# auth false on a session-required function warns and still requires a session

In `runPikkuFunc` (`packages/core/src/function/function-runner.ts`), a function
that is not `sessionless` is session-required. If the wiring or the function
config says `auth: false`, the runner logs
"requires a session but auth was explicitly disabled — use pikkuSessionlessFunc
instead." and then still throws `MissingSessionError` when no session is present.

The test "should warn when auth is disabled for a session-required function but
still enforce session" in `function-runner.test.ts` states the intent. The
warning points the author at the function kind that actually means "no session",
which is `pikkuSessionlessFunc`. The same flag on a sessionless function is the
opposite declaration and is covered by
[A public function says so with auth: false](a-public-function-says-so-with-auth-false.md).

**What this rules out:** treating `auth: false` on a `pikkuFunc` as making it
public. Making a function public means using `pikkuSessionlessFunc`, and a
session-required function that disables auth still fails closed.
