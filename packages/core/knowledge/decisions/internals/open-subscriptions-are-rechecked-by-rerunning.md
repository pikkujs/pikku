---
type: decision
title: Open subscriptions are re-checked by re-running the subscribe function
description: The sweeper re-runs each stored subscribe function on the session's refreshed scopes and drops a subscription that throws or names another topic; sessions that cannot be re-read end at maxSubscriptionLifetime.
tags: core, event-hub, security
---

# Open subscriptions are re-checked by re-running

A stream outlives the request that authorised it. Each subscription stores
`{ pikkuFuncId, packageName, wireType, wireId, input, session, expiresAt }`; the
sweeper re-runs that function through `runPikkuFunc` with the scopes re-read from
the scope service (`withLiveScopes`). A throw (a revoked scope, a permission that
now says no) or a different topic drops the subscription, and a channel left with
none is closed so the client reconnects and is checked from scratch.

A session whose scopes were never resolved from the scope service (`mapSession`,
`mapKey`, none) cannot be re-read, so it gets a hard end: `expiresAt` is set to
now plus `maxSubscriptionLifetime` (default one hour) and the subscription is
dropped without a re-run.

Core cannot see how long a grant lives in the auth provider, so the recheck
interval is an input to the sweeper (`subscriptionRecheckMs`, default one
minute, `0` off). Re-running assumes a subscribe function has no side effects:
it should compute a topic, not write.

**What this rules out:** trusting the session from connect time for the life of
the stream, and a revocation that waits for the client to disconnect.
