---
type: decision
title: One delivery backend per channel, and relays never deliver
description: A channel is owned by exactly one delivery backend; a relay only forwards between instances and hands inbound events back to the distributor, which delivers locally and never forwards them again.
tags: core, event-hub, relay
---

# One delivery backend per channel, and relays never deliver

Backends only move bytes. A delivery backend sends to the channels of one
transport (`local`, `ws`, `uws`, `bun`); a relay (Postgres NOTIFY, MQTT) forwards
what this instance published to the others. Registration fails when two delivery
backends claim one transport, or when two relays' topic maps overlap, because
either would send an event twice.

A relay never delivers to a channel. Its inbound events go back to the
distributor, which re-checks the topic against the relay's map and against the
declared topics, delivers to local channels only, and does not forward it again.
So an event is delivered once per channel and is relayed once.

A relay may fail (a payload over 8 kB, a dropped connection): that is reported to
`onError` and never fails the publisher, so local delivery still happens.

**What this rules out:** a relay that owns sockets, a loop where instance B
re-relays what A sent, and a relay that accepts a topic nothing declared.
