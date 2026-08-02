---
type: decision
title: A channel's user id is persisted only after onConnect middleware has run
description: The channelId to pikkuUserId mapping is written post-onConnect, because auth middleware is what establishes the session
tags: channel
---

# A channel's user id is persisted only after onConnect middleware has run

`runChannelConnect` in
`packages/core/src/wirings/channel/serverless/serverless-channel-runner.ts`
reads `userSession.getPikkuUserId()` and calls `channelStore.setPikkuUserId`
*after* `runChannelLifecycleWithMiddleware` has executed the `onConnect`
lifecycle, not before.

Auth middleware runs as part of that lifecycle — it is what inspects the upgrade
request's cookie or token and calls `setSession`. Before it runs there is no
`pikkuUserId` to store, so an earlier write would persist `undefined` and the
channel would stay anonymous for its whole life. That mapping is what
`runChannelMessage` and `runChannelDisconnect` later use to rehydrate the session
from the `sessionStore` on each subsequent invocation, since serverless keeps
nothing in memory between them.

**What this rules out:** moving the `setPikkuUserId` call up next to
`channelStore.addChannel` to group the store writes together, and assuming a
session exists on the wire before `onConnect` has completed. It also means an
`onConnect` handler that throws leaves the channel with no user mapping — the
error path deliberately does not persist one.
