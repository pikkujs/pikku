---
type: overview
title: Decisions
description: How the NATS factory handles connection loss and reconnects
---

# Decisions

<!-- pikku:knowledge-index -->

- [A dead NATS connection is reported, never reopened](a-dead-nats-connection-is-reported-never-reopened.md) — The factory reconnects forever, but once the client gives up (an authorization violation, for example) it only calls the caller's onConnectionLost hook and never rebuilds the connection
- [Standalone deploys get NATS from a contributor opted in with wireContributors, not an addon](standalone-deploys-get-nats-from-a-contributor-opted-in-with-wirecontributors.md) — @pikku/queue-nats publishes a deploy contributor that replaces the in-memory queue and scheduler; it fails closed without NATS_URL and PIKKU_APP_SLUG and names its stream after the slug

<!-- /pikku:knowledge-index -->
