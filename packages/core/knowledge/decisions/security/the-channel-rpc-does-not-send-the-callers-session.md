---
type: decision
title: The channel RPC does not put the caller's session on the wire
description: ChannelRPCService.invoke accepts a session only to satisfy the DeploymentService shape and never sends it, so the peer runs the capability as itself
tags: core, channel, rpc, security
---

# The channel RPC does not put the caller's session on the wire

The doc comment on `ChannelRPCService.invoke` in
`packages/core/src/wirings/channel/channel-rpc-service.ts:55-60` says `session`
is accepted to satisfy `DeploymentService` and is deliberately not sent. The peer
runs the capability as itself, on its own machine, and a session on the wire
would carry the caller's credentials while authorising nothing.

The signature takes the value as `_session?: unknown` (`:61-65`). The request
sent on the channel carries `id`, `funcName`, `data` and `traceId` (`:88-94`), and
the file does not refer to the session elsewhere in `invoke`.

**What this rules out:** forwarding the caller's session to a channel peer, and
treating a session on this path as an authorisation the peer will honour.
