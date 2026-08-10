---
type: decision
title: A wrapped agent-stream send must return the inner send's promise
description: Middleware runs asynchronously, so dropping the returned promise turns every awaited channel.send upstream into a no-op
tags: core, ai-agent
---

# A wrapped agent-stream send must return the inner send's promise

`streamAIAgent` wraps the caller's channel so every event passes through the
stream middleware. That wrapper's `send` returns whatever the inner `send`
returns, and it must: the middleware chain is asynchronous, so a wrapper that
calls the inner `send` and returns `undefined` resolves immediately while the
event is still in flight.

Every `await channel.send(...)` upstream then becomes a no-op that resolves
before the thing it is waiting for has happened. The one that matters is the
final flush — a buffering hook such as `voiceOutput` is still synthesizing audio
when the awaited send resolves, and the `close()` that follows discards it.

**What this rules out:** writing the wrapper as a fire-and-forget `(msg) => {
inner.send(msg) }`, which reads as equivalent and is not.
