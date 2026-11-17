---
'@pikku/queue-nats': patch
---

`NatsServiceFactory.close()` now waits for recurring tasks that are still running before the connection closes, so they ack instead of being redelivered after `ack_wait`. A refused attach in `init()` closes the connection it opened.
