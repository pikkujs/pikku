---
'@pikku/addon-queue-nats': patch
---

`@pikku/addon-queue-nats` is built as an addon and moves to `packages/addon/queue-nats`. Its entry point is now `dist/src/index.js` and its generated metadata is served under `./.pikku/*`. The `nats` service gains a dev variant that provides an inert `natsLifecycle`, so `pikku dev` resolves it; a target that reaches `queueService`, `schedulerService` or `natsLifecycle` selects it, and a Worker unit that does is refused at build time. See docs/MIGRATION.md.
