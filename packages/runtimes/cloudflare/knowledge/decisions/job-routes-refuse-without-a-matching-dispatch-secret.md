---
type: decision
title: Job routes refuse without a matching dispatch secret
description: The Cloudflare queue-job and scheduler-job routes fail closed when PIKKU_DISPATCH_SECRET is unset, and compare the header in constant time
tags: [cloudflare, dispatch, auth]
---

# Job routes refuse without a matching dispatch secret

`isDispatchAuthorized` in `packages/runtimes/cloudflare/src/dispatch-auth.ts` (lines
46-62) returns false in three cases:

- `PIKKU_DISPATCH_SECRET` is unset or empty. It logs an error naming the variable
  and the header (lines 50-56).
- The `x-pikku-dispatch` header is missing (lines 57-60).
- The header does not match the secret. The comparison is `constantTimeEqual`
  (line 61).

`constantTimeEqual` (lines 22-44) signs both values with an HMAC under a fresh random
key, then compares the digests with an XOR accumulator. The comment at lines 15-21
says this hides both the secret's bytes and its length from timing.

`dispatchUnauthorizedResponse` (lines 64-72) returns the same 401 for every refusal.
Its comment says it "never distinguishes an unset secret from a mismatched one"
(lines 64-67).

In `packages/runtimes/cloudflare/src/handler-factories.ts`, the `/__pikku/queue-job`
route checks `isDispatchAuthorized` before any setup (line 193). The comment at
lines 186-187 says the route is gated on the shared secret and "fails closed when
unset". The `/__pikku/scheduler-job` route does the same check at line 261.

**What this rules out:** running a job-dispatch route on a worker that has no secret
configured, and telling a caller which of the two failures happened.
