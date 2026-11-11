---
type: decision
title: Standalone deploys get NATS from a contributor opted in with wireContributors, not an addon
description: '@pikku/queue-nats publishes a deploy contributor that replaces the in-memory queue and scheduler; it fails closed without NATS_URL and PIKKU_APP_SLUG and names its stream after the slug'
tags: [nats, contributors, deploy, standalone]
---

# Standalone deploys get NATS from a contributor opted in with wireContributors

`@pikku/queue-nats` is not an addon: it has no functions. It publishes one
contributor, `nats` (deploy variant), through `pikku.config.json` and a
`pikku all` build step (exports `./.pikku/contributors/*`). An app opts in at
build time with `wireContributors({ package: '@pikku/queue-nats', contributors:
['nats'] })`. The inspector records it like `wireAddon`'s `contributors` list,
without declaring an addon.

- `when: p => p.needsQueue`. A cron-only app has no queue capability, so it
  keeps the in-memory scheduler.
- It reads `NATS_URL` from `env` and refuses to start without it. There is no
  fallback to the in-memory queue: a silent fallback loses jobs on restart.
- The stream is `pikku-<slug>` and the subject prefix `pikku.<slug>`, where
  slug is `PIKKU_APP_SLUG` (`^[a-z0-9][a-z0-9_-]*$`), identical across
  releases so a new release resumes the old release's queue. Unset refuses.
- It provides `natsLifecycle`, not the factory. The server stops every
  singleton service that has `stop()` before the contributor stop hooks run,
  which would close the workers before they were drained. The handle has no
  `stop`, so only `onServerStop` runs: drain (10s), then close.

## Known limits

- `NatsSchedulerService.start()` prunes schedules missing from this process's
  task set, so two live releases with different task sets fight.
- Workflows are not covered. The in-memory workflow service keeps working next
  to NATS (its queue workers register on NATS, verified with a sleep step) but
  is not durable; a durable setup needs workflowService, workflowRunService and
  leaseService on SQLite.
