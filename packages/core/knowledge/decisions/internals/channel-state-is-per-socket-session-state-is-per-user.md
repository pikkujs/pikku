---
type: decision
title: Channel state is per-socket, session state is per-user
description: ChannelStore holds connection-scoped scratch data keyed by channelId, deliberately separate from the pikkuUserId-keyed SessionStore
tags: channel
---

# Channel state is per-socket, session state is per-user

`ChannelStore.setState` / `getState` / `clearState` in
`packages/core/src/wirings/channel/channel-store.ts` are keyed by `channelId` and
hold scratch data that belongs to one socket: a per-connection subscription
filter, the current step of a connection-bound state machine, the last command
this socket sent. The store clears it when the channel is removed. `SessionStore`
is keyed by `pikkuUserId` and holds the user session, which is shared across HTTP
and channel transports and outlives any one connection.

The two are separate stores because their lifetimes and their scopes differ. One
user may hold several sockets at once; writing socket-local data into the session
would let those sockets overwrite each other and would leak connection state into
HTTP requests. The serverless runner in `serverless/serverless-channel-runner.ts`
rebinds `channel.setState/getState/clearState` onto the `ChannelStore` on every
connect, message and disconnect precisely because there is no in-process channel
object to hang the state off between invocations.

**What this rules out:** backing `channel.setState` with the session store, or
merging the two stores behind one interface "since both are key-value". Also
rules out assuming channel state survives a reconnect — a new socket is a new
`channelId` and starts empty.
