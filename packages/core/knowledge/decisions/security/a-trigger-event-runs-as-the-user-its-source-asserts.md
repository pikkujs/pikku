---
type: decision
title: A trigger event runs as the user its source asserts, never one its data names
description: trigger.invoke takes the user as a separate option the source sets, the target runs as that user like a queue job does, and a malformed user drops the event
tags: core, trigger, security
---

# A trigger event runs as the user its source asserts, never one its data names

`PikkuTrigger.invoke(data, { pikkuUserId })` in
`packages/core/src/wirings/trigger/trigger.types.ts` lets a trigger source say
which user an event belongs to (#1618). `PikkuTriggerService.onTriggerFire`
puts that id on the wire it builds the target's wire services and RPC context
from, so the target resolves as that user through the same path a queue job or
workflow run carrying a `pikkuUserId` does: `defaultPikkuUserIdResolver` reads
it first, the credential wire service loads that user's `type: 'wire'`
credentials, a configured session store supplies their stored session, and
`startWorkflow` records the id on the run.

The user is an argument of its own, not a field of `data`, because `data` is
often an external payload the source only relays. Only the source's code — which
runs server-side and decides whose credential it polled with — can name a user;
nothing a webhook or a message sender controls reaches that argument.

A `pikkuUserId` that is present but not a non-empty string drops the event with
an error log. Running it as nobody would hide the source's bug, and there is no
other user it could correctly run as.

**What this rules out:** reading a user id out of the event data on the source's
behalf, per-user trigger instances (a source re-enumerates its users each tick
instead, so a dead replica's users are picked up by the next tick), and widening
the source function's own wire with a user — the source runs for everybody.
