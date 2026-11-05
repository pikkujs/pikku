---
type: decision
title: A channel connection is one trace
description: A local channel opens one trace per connection and each lifecycle hook, message and reverse RPC is a span in it. A serverless channel has no store for it, so each frame is its own trace.
tags: core, channel, observability
---

# A channel connection is one trace

A connection lives for minutes or hours and every message on it belongs to the
same conversation, so `channelHandler.trace` is created when the connection
opens and each hook, message and reverse RPC continues it with a new span.

The upgrade request's `traceparent` is not adopted: a socket upgrade is public
HTTP, which [ignores an inbound trace](../security/index.md).

Serverless channels keep their state in `ChannelStore`, which has no field for a
trace, and adding one means a schema change in every store. Until it has one,
each frame of a serverless channel gets a trace of its own. Frames of one
connection share `channelId`, which is how to join them.
