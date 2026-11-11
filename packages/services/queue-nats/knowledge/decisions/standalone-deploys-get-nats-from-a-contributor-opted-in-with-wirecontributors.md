---
type: decision
title: Standalone deploys get NATS from a contributor opted in with wireContributors, not an addon
description: '@pikku/queue-nats publishes a standalone-only deploy contributor that puts a stage on a shared JetStream stream as one restricted tenant; it fails closed without its credentials and names everything after PIKKU_PROJECT and PIKKU_STAGE'
tags: [nats, contributors, deploy, standalone, permissions]
---

# Standalone deploys get NATS from a contributor opted in with wireContributors

`@pikku/queue-nats` is not an addon: it has no functions. It publishes one
contributor, `nats` (deploy variant only, so `pikku dev` never gets it),
through `pikku.config.json` and a `pikku all` build step (exports
`./.pikku/contributors/*`). An app opts in at build time with
`wireContributors({ package: '@pikku/queue-nats', contributors: ['nats'] })`.

## Which build applies it

Source opt-in is not enough, because the cloud builds the same source. The
deploy build puts the provider's name on the contributor platform
(`platform.provider`; unset in dev), and the contributor's `when` is
`needsQueue && provider === 'standalone'`. A Cloudflare build of the same app
selects nothing and bundles no NATS code; the cloud keeps HTTP dispatch.
Absent the provider the contributor is not applied. Limit: a provider with no
contributor support at all (serverless, Azure) still fails the build for any
opted-in deploy variant; that check predates this and was left alone.

## Tenant on a shared stream

The stream (`PIKKU`, `pikku.>`, workqueue, `allow_msg_schedules`, or
`NATS_STREAM`) is created by whoever runs the broker. The factory runs in
`attachToStream` mode: it only reads the stream and refuses one that is
missing, does not cover the stage's subjects, is not workqueue or has
schedules off. It never creates, updates or purges it.

- Needs `NATS_URL`, `NATS_USER`, `NATS_PASSWORD`, `PIKKU_PROJECT`,
  `PIKKU_STAGE`. Any one missing, or a project or stage that is not
  `[a-z0-9]+(-[a-z0-9]+)*` (at most 63), refuses to start. No anonymous
  connection, no in-memory fallback.
- Subjects are `pikku.<project>.<stage>.<queue>` and schedules sit at
  `pikku.<project>.<stage>._schedule.<queue>.<task>`, all inside the stage
  prefix. Cron fires go to one recurring-task queue, not one subject per task.
- Consumers are named `<project>_<stage>_<queue>`. The separator is `_`, which
  the token rule forbids in project and stage, so `a-b` + `c` and `a` + `b-c`
  cannot share a prefix.
- Reply inboxes use `_INBOX.<project>.<stage>`, so a stage subscribes to its
  own replies only.
- It provides `natsLifecycle`, not the factory. The server stops every
  singleton service with `stop()` before the stop hooks run, which would close
  the workers before they drain. `onServerStop` drains (10s), then closes.

## What the broker permissions can and cannot do

JetStream API permissions cannot match a consumer-name prefix (`*` is a whole
token). Only `CONSUMER.CREATE` carries the filter subject, which can be scoped.
So a stage is granted its exact consumer names, read from the build's queue
list (wired workers, one orchestrator per workflow, plus the recurring-task and
mesh-rpc queues). The lists are in
`verifiers/deploy-standalone-nats/broker.ts`.

A purge is whole-stream or by a filter the caller names, and a permission
cannot tell them apart, so a stage is not granted it. The scheduler therefore
retires an orphaned schedule by republishing it as a one-shot that fires now
and is acknowledged without running. Stored messages (`MSG.GET`) are not
granted either, so `getTask` and `getAllTasks` find nothing.

A schedule's `Nats-Schedule-Target` is not checked against the publisher's
permissions: a stage may schedule a message onto another stage's subject.
Permissions cannot close this; only a stream per stage would.

## Known limits

- Workflows are not covered. The in-memory workflow service keeps working next
  to NATS (its queue workers register on NATS, verified with a sleep step) but
  is not durable; durable needs workflowService, workflowRunService and
  leaseService on SQLite.
- A cron-only app has no queue capability, so `needsQueue` is false and it
  keeps the in-memory scheduler.
