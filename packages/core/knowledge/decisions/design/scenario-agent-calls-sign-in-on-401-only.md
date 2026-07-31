---
type: decision
title: Scenario agent calls sign in on 401 only
description: postAgent sends the first request with whatever session it holds and logs in only if refused, so an actor can converse with a no-auth agent with no sign-in wiring
tags: services
---

# Scenario agent calls sign in on 401 only

`HttpScenarioActor.postAgent`
(`packages/core/src/services/http-scenario-actors.ts`) sends its first request
with whatever cookie the jar happens to hold — none, for an actor that has never
signed in — and only a 401 triggers `login()` and a single retry. Its sibling
`invokeRaw` does the opposite: it signs in eagerly before the first RPC.

The asymmetry is deliberate. Agent HTTP routes may be public; RPC routes are
assumed not to be. Making agent calls eager would mean an actor could not talk to
a no-auth agent at all without a sign-in endpoint, an actor secret and a user
table — a large amount of wiring to exercise an agent that requires none of it.
Deferring to the 401 keeps the authenticated case working (the retry succeeds
with the session attached) at the cost of one extra round trip the first time.

**What this rules out:** unifying the two paths so `postAgent` signs in up front
"like `invokeRaw` does", and removing the 401 retry on the grounds that
`invokeRaw` already guarantees a session. Note the ordering consequence: an actor
whose first action is `converse` against a no-auth agent never signs in at all, so
nothing else may assume `signedIn` is true after a conversation.
