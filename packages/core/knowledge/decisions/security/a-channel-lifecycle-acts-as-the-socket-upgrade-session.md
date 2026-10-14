---
type: decision
title: A channel lifecycle acts as the session the socket upgrade established
description: onConnect and onDisconnect run with the userSession captured during the socket upgrade, both in the wire they receive and as the session service passed to runPikkuFunc
tags: core, channel, sessions, lifecycle
---

# A channel lifecycle acts as the session the socket upgrade established

`runChannelLifecycle` in `packages/core/src/wirings/channel/channel-common.ts` takes an optional `userSession`. The comment says it is established while the socket upgrades, so `onConnect` can tell who connected (`channel-common.ts:43-47`). The same function also serves `connect` and `disconnect` (`channel-common.ts:38`).

The wire for the lifecycle is built from that session when one exists (`channel-common.ts:78`). The lifecycle function then runs through `runPikkuFunc` with `sessionService: userSession` (`channel-common.ts:84-90`). So the lifecycle reads and writes the same session the upgrade produced, for both connect and disconnect.

The related decision that records when the user id is stored is [a channel's user id is persisted only after onConnect middleware has run](../internals/channel-user-id-is-persisted-after-onconnect-middleware-runs.md).

**What this rules out:** running a channel's disconnect handler as a different identity than the one that connected the socket, and building the lifecycle wire without the upgrade session when one was established.
