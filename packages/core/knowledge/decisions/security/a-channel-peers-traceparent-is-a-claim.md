---
type: decision
title: A channel peer's traceparent is a claim
description: createChannelRPCResponder ignores the traceparent on a request unless trustInboundTraceparent is set, the same fail-closed rule as public HTTP.
tags: core, channel, security, observability
---

# A channel peer's traceparent is a claim

A reverse RPC frame comes from the other end of a socket, so its `traceparent`
is what that end says it is. A trace id is not an identity, but letting a peer
choose it lets it write into, or hide among, another caller's trace.

`createChannelRPCResponder` therefore hands a capability the value only under
`trustInboundTraceparent`, which is off by default. Turn it on only for a channel
whose peer has been authenticated.
