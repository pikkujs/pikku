---
type: decision
title: A channel requires a session unless it says auth: false
description: The channel-level requirement is auth !== false, and a message handler's own auth, when it is set, decides for that message in either direction
tags: core, channel, auth
---

# A channel requires a session unless it says auth: false

Both channel runners compute the channel-level requirement as
`channelConfig.auth !== false`: `packages/core/src/wirings/channel/channel-runner.ts:142`
and `packages/core/src/wirings/channel/channel-handler.ts:75`. An absent `auth`
therefore requires a session. `channel.types.ts:67-76` documents the same rule and
says why: a proxy in front of a channel needs to tell public from private.

Per message, `validateAuth` (`channel-handler.ts:49-65`) uses the channel's
`requiresSession` when the handler is a bare function or has no `auth` of its own
(`:50-58`). When the handler object sets `auth`, that value wins (`:58-60`). The
check then fails only when `auth` is true and there is no session (`:62-64`).

So a message handler's `auth: false` loosens a channel that requires a session for
that message, and `auth: true` tightens a public channel for that message. A
rejected message gets the reply described in the question
`unauthorized-channel-replies-escape-the-declared-out-type.md`.

**What this rules out:** treating a channel with no `auth` flag as public.
