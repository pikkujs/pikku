---
'@pikku/queue-nats': patch
---

`@pikku/queue-nats` no longer rebuilds through the workspace `pikku` CLI when it is published. The rebuild raced `@pikku/cli`'s own publish build and failed the release.
