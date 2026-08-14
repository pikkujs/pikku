---
type: decision
title: An interrupt is not a failure, and the non-streaming path throws rather than returning
description: It skips the onError hooks and never becomes an errorMessage; with no partial reply to hand back, a typed throw is what distinguishes it from a provider outage
tags: core, agent
---

# An interrupt is not a failure

Interrupting a run skips the `onError` hooks entirely and never becomes an
`errorMessage`. Someone asked the agent to stop and it stopped; that is the
feature working, and running failure handlers over it would report an incident
that did not happen.

The streaming and non-streaming paths then diverge, because what they can hand
back differs. A stream has already delivered part of the reply, so it returns
that fragment. `runAgent` has delivered nothing — there is no partial answer to
return — so it throws a typed error instead. A caller can tell that apart from a
provider outage, which returning an empty result would not allow.

**What this rules out:** unifying the two paths on "return whatever you have".
For the non-streaming path that is an empty string, and an empty string is
indistinguishable from a model that answered with nothing.
