---
'@pikku/queue-nats': patch
---

`@pikku/queue-nats` is a plain library: it exports `connectNats(logger, env)`, which an app calls in `pikkuServices`, in place of the contributor. Register the queue workers with `natsLifecycle.registerQueues(logger)` from the server lifecycle's `beforeStart`. `natsLifecycle.stop()` drains the workers and closes the connection. See docs/MIGRATION.md.
