---
'@pikku/queue-nats': patch
---

`@pikku/queue-nats` publishes `nats` as a `pikkuService` with a deploy variant, in place of the contributor. Opt in with `wireAddon({ name: 'nats', package: '@pikku/queue-nats', services: ['nats'] })`; it exports `./.pikku/services/*`. Wire it once: a target that nothing reaches `nats` from does not run it. `natsLifecycle` has a `stop()` that drains the workers and closes the connection, and `connectNats(logger, env)` is exported for tests. See docs/MIGRATION.md.
