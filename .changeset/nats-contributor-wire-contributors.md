---
'@pikku/core': patch
'@pikku/inspector': patch
'@pikku/inspector-go': patch
'@pikku/cli': patch
'@pikku/queue-nats': patch
---

Add `wireContributors({ package, contributors })` to opt a package's deploy contributors in without declaring an addon, and a `nats` contributor in `@pikku/queue-nats` that replaces the in-memory queue and scheduler in standalone deploys. It needs `NATS_URL` and `PIKKU_APP_SLUG` and refuses to start without them.
