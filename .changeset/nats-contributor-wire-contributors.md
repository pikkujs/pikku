---
'@pikku/core': patch
'@pikku/inspector': patch
'@pikku/inspector-go': patch
'@pikku/cli': patch
'@pikku/queue-nats': patch
---

Add `wireContributors({ package, contributors })` to opt a package's deploy contributors in without declaring an addon, put the deploy provider on the contributor platform, and add a `nats` contributor in `@pikku/queue-nats` that replaces the in-memory queue and scheduler in standalone deploys only. It attaches to a shared JetStream stream as one restricted tenant and needs `NATS_URL`, `NATS_USER`, `NATS_PASSWORD`, `PIKKU_PROJECT` and `PIKKU_STAGE`; it refuses to start without them.
