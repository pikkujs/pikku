---
type: overview
title: Decisions
description: How the NATS factory handles connection loss and reconnects
---

# Decisions

<!-- pikku:knowledge-index -->
- [A dead NATS connection is reported, never reopened](a-dead-nats-connection-is-reported-never-reopened.md) — The factory reconnects forever, but once the client gives up (an authorization violation, for example) it only calls the caller's onConnectionLost hook and never rebuilds the connection
- [An app creates NATS in pikkuServices](an-app-creates-nats-in-pikku-services.md) — connectNats puts a stage on its own JetStream stream as a restricted user; it fails closed without its credentials and names everything after PIKKU_PROJECT and PIKKU_STAGE
<!-- /pikku:knowledge-index -->
