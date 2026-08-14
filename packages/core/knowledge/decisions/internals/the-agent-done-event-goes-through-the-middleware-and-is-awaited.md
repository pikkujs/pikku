---
type: decision
title: The agent `done` event goes through the middleware and is awaited
description: `done` is the only end-of-reply signal a stream hook gets, and buffering hooks flush on it — sending it raw discards work already paid for
tags: core, agent
---

# The agent `done` event goes through the middleware and is awaited

Both the first turn and the post-approval resume send their terminating `done`
event through the stream middleware rather than straight at the channel, and
await it.

`done` is the only signal a stream hook receives that the reply is over. The
hooks that buffer need it to flush: `voiceOutput` holds a trailing fragment that
never reached a full stop, and waits on audio it has already asked the provider
to synthesize and already been billed for. Sending `done` raw skips those hooks
entirely, and the `close()` immediately after throws the buffered work away.

It matters more on the resume path than the first turn. After an approval, most
of what gets spoken is the agent describing what it just did — so a dropped
flush silences the larger half of the reply.

**What this rules out:** treating the terminating event as a special case that
can bypass the chain because "nothing comes after it". Something does: the
flush.
