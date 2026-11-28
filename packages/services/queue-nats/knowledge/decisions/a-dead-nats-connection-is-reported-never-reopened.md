---
type: decision
title: A dead NATS connection is reported, never reopened
description: The factory reconnects forever, but once the client gives up (an authorization violation, for example) it only calls the caller's onConnectionLost hook and never rebuilds the connection
tags: [nats, queues, connections, reconnect]
---

# A dead NATS connection is reported, never reopened

`NatsServiceFactory` in `packages/services/queue-nats/src/nats-service-factory.ts` passes
the user, pass and token it is given straight to `connect` (`nats-service-factory.ts:43-46`,
`:126-131`). It sets `maxReconnectAttempts: -1` so the client keeps retrying
(`nats-service-factory.ts:147`), and the comment above it explains why the client default
would turn a long outage into a silent one (`nats-service-factory.ts:132-146`).

For a fault the client will not retry, `onConnectionLost` is the only response. Its doc
comment says an authorization violation is the case that matters, that "NOTHING reopens
it, because `init()` runs once at boot", and that rebuilding the connection would not help
because the queue, worker and scheduler services each kept the old JetStream client
(`nats-service-factory.ts:48-56`). It says the hook is "an escalation hook, not a repair
one", the caller owns the choice, and the default is to warn (`nats-service-factory.ts:58-62`).

`watchForUnexpectedClose` logs the loss and calls the hook; it does not reopen the
connection (`nats-service-factory.ts:243-253`).

**What this rules out:** rebuilding the connection inside the factory after an
authorization failure, and exiting the process by default when the connection is lost.
