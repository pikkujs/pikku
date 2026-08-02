---
type: decision
title: Serverless channel disconnect must tolerate a missing channel
description: A failed channel lookup on disconnect returns quietly, because serverless runtimes deliver disconnect more than once
tags: channel
---

# Serverless channel disconnect must tolerate a missing channel

`runChannelDisconnect` in
`packages/core/src/wirings/channel/serverless/serverless-channel-runner.ts`
wraps `channelStore.getChannel(channelId)` in a `try`/`catch` and returns after
an info log when the lookup fails, before any lifecycle function runs.

Serverless runtimes do not guarantee a single disconnect delivery.
`serverless-offline`, worker-thread runners and retried invocations all call the
disconnect path more than once for the same connection, and the second call
arrives after `channelStore.removeChannels` has already run. There is nothing
left to disconnect at that point, so an error would be noise on a normal
shutdown — and, where the platform retries on failure, a loop. The local runner
does not need this because the channel object lives in-process for the whole
connection.

**What this rules out:** treating a missing channel as an error worth throwing or
logging at error level, and hoisting the `getChannel` call out of its `try` while
"tidying up" the early returns. It also means `onDisconnect` is best-effort, not
exactly-once — anything that must happen once per connection needs its own
idempotency, not this handler.
