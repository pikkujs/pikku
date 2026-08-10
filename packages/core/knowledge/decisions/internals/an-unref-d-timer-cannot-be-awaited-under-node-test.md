---
type: decision
title: An unref'd timer cannot be awaited under node:test
description: The channel RPC registry unrefs its timeout so a pending call never holds a process open, which makes that timeout unawaitable in a test and silently cancels the rest of the file
tags: core, channel, testing
---

# An unref'd timer cannot be awaited under node:test

`ChannelRPCRegistry.register()` schedules the call's timeout and then unrefs it:

```ts
// Never hold the process open waiting on a peer that may not answer.
timer?.unref?.()
```

That is correct, and should stay. A server shutting down must not be held open
for up to 30 seconds per in-flight reverse RPC.

It also means the timeout can never fire in a test that awaits it. An unref'd
timer does not keep the event loop alive, so when the pending call is the only
thing left the loop drains first, and node:test reports:

```
Promise resolution is still pending but the event loop has already resolved
```

The damage is not local. That one test hangs, the runner cancels the **file**,
and every later test in it is reported `cancelledByParent` — 32 of them in
`channel-rpc.test.ts`, of which only two were the actual problem. Worse, the
count moves: under a full-suite run other ref'd handles sometimes keep the loop
alive long enough for the timer to land, so the file reported `32 cancelled` or
`1 fail + 31 cancelled` depending on timing. Two of the "failures" were tests
that pass perfectly well on their own.

Reproducible with no project code at all — a bare `node --test` file where one
test awaits a ref'd timer and one awaits an unref'd one passes the first and
cancels the second.

**The fix belongs in the test, not the registry.** Use the test-scoped mock
clock and drive it by hand:

```ts
test('times out instead of hanging forever', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const registry = new ChannelRPCRegistry(10)
  const call = registry.register()

  const rejected = assert.rejects(call.promise, ...)  // attach BEFORE ticking
  t.mock.timers.tick(10)
  await rejected
})
```

`t.mock.timers` is scoped to the test and resets itself, so tests that want a
real clock are unaffected. Attach the rejection handler before ticking, or the
rejection lands unhandled.

**What this rules out:** dropping the `unref` to make the tests pass. That
trades a test-only annoyance for a production one — every in-flight call would
then pin the process during shutdown. Also rules out reading a cancelled count
in this file as a count of broken tests; check which test actually hangs first,
because the rest are collateral.

Related: [[the-api-report-pins-members-not-just-names]] for the other case where
a measurement in this repo counted the wrong thing convincingly.
