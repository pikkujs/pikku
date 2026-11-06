---
type: decision
title: A channel connection is one trace
description: A channel opens one trace per connection and each lifecycle hook, message and reverse RPC is a span in it. A serverless channel keeps it in ChannelStore.
tags: core, channel, observability
---

# A channel connection is one trace

A connection lives for minutes or hours and every message on it belongs to the
same conversation, so `channelHandler.trace` is created when the connection
opens and each hook, message and reverse RPC continues it with a new span.

The upgrade request's `traceparent` is not adopted: a socket upgrade is public
HTTP, which [ignores an inbound trace](../security/index.md).

A serverless channel has no process to hold it in, so connect writes the trace
to `ChannelStore` as a `traceparent` and each frame and the disconnect restore it
exactly, with the connection's own span and not a new one, because a frame is a
child of that span the same way it is on a local channel. A channel stored
without one, or with one that does not parse, gets a new trace per frame: losing
the link must not fail a message.
