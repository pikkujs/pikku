---
type: decision
title: A bearer token checked against a secret is read per request, and an unreadable secret means no session
description: The secretId form of authBearer reads the secret on every request; a missing or failing read leaves the request without a session rather than raising an error
tags: core, middleware, auth
---

# A bearer token checked against a secret is read per request, and an unreadable secret means no session

In `packages/core/src/middleware/auth-bearer.ts:57-70`, a token given as a
literal `value` is compared directly (`:59-60`). A token given a `secretId` is
read from the secret service on each request (`:63-64`). A failed read is caught
and becomes `undefined` (`:65`), and the code comments that an unset secret means
the feature is off, never a request error (`:62`).

An undefined expected value skips the comparison (`:68`). `userSession` stays
null, and `setInitialSession` is not called (`:55`, `:75-77`). A malformed scheme is a
different case: it throws `InvalidSessionError` (`:50-53`).

The static and JWT branches of this middleware are covered by the existing
questions `a-bearer-jwt-with-no-identity-becomes-a-session.md` and
`should-a-wrong-bearer-token-be-anonymous-or-refused.md`.

**What this rules out:** turning a missing or unreadable signing secret into a
server error, and caching the secret value across requests in the middleware
closure.
