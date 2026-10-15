---
type: decision
title: A channel with auth false marks its connect and disconnect handlers sessionless
description: The inspector synthesises metadata for a channel's connect and disconnect functions and sets sessionless from the channel's auth
tags: [inspector, channels, auth]
---

# A channel with auth false marks its connect and disconnect handlers sessionless

In `packages/inspector/src/add/add-channel.ts`, `channelAuth` is read from the channel's
`auth` property (line 705). `sessionless` is `true` only when that value is `false`
(line 708). Otherwise it is `undefined`.

For each of the connect and disconnect function ids (line 709), the inspector creates a
metadata entry with that `sessionless` value when none exists yet (lines 710-717). An entry
that already exists is left alone (line 710).

The comment at lines 701-704 says these handlers are defined with the channel-specific
helpers and not `pikkuFunc` or `pikkuSessionlessFunc`, so the runtime needs the flag here.

**What this rules out:** a channel with `auth: false` whose connect or disconnect handler is
still treated as needing a session. The check covers only the channel's own `auth` value.
