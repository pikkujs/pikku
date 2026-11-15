---
type: decision
title: Functions get only the publisher
description: services.eventHub has publish and nothing else. The runtime holds the distributor that attaches channels; apps get a registry that can only add a relay.
tags: core, event-hub, security
---

# Functions get only the publisher

One object has three faces. `services.eventHub` is a frozen `{ publish }`:
`'subscribe' in services.eventHub` is false at runtime, not just in the types.
`services.eventHubRegistry` is a frozen `{ add }` for an app or addon to register
a relay. The distributor (`attach`, `detach`, `addSubscription`, `dropSession`)
is held only in package state by the runtime and never appears in services.

The internal method is `addSubscription` so that `subscribe` only ever means the
public function. The internal path (`@pikku/core/internal/event-hub`) is off the
public surface, and the inspector refuses a function that touches the full hub.

**What this rules out:** a function reaching a socket directly, a function
subscribing a channel it did not authorise, and a test that passes only because
the type hides a method that still exists.
