---
type: question
title: Does skipUserSession do anything on a channel?
description: The local channel runner accepts and forwards skipUserSession, but the channel open path never reads it, unlike the HTTP runner which refuses it on a session-requiring route
tags: core, channel, http, sessions
---

# Does skipUserSession do anything on a channel?

`runLocalChannel` in `packages/core/src/wirings/channel/local/local-channel-runner.ts`
takes `skipUserSession = false` (`:66`) and passes it to `openChannel` (`:104`).

`openChannel` in `packages/core/src/wirings/channel/channel-runner.ts:121-130` has
`RunChannelOptions` in its parameter type, which includes `skipUserSession`
(`channel.types.ts:31`). The function destructures only `route`,
`coerceDataFromSchema` and `request`. A search of `packages/core/src` finds no
read of the option in the channel code.

The HTTP runner handles the same option differently. `packages/core/src/wirings/http/http-runner.ts:211-213`
throws when `skipUserSession` is set on a route that requires a session.

**Question:** on a channel that requires a session, is `skipUserSession: true`
meant to be refused like the HTTP case, or is it intentionally ignored? The code
accepts it and does nothing with it.
