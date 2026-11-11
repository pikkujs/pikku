---
type: decision
title: Standalone deploys get NATS from a contributor opted in with wireContributors, not an addon
description: '@pikku/queue-nats publishes a standalone-only deploy contributor that puts a stage on its own JetStream stream as a restricted user; it fails closed without its credentials and names everything after PIKKU_PROJECT and PIKKU_STAGE'
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

## One stream per stage

Whoever runs the broker (Studio) creates, up front, one stream per stage:
`pikku_<project>_<stage>` (or `NATS_STREAM`), subjects `pikku.<project>.<stage>.>`,
workqueue, `allow_msg_schedules`. The factory runs in `attachToStream` mode: it
only reads the stream and refuses one that is missing, does not cover the
stage's subjects, is not workqueue or has schedules off. It never creates or
updates it. `streamConfig` in `verifiers/deploy-standalone-nats/broker.ts` is
the config to reuse.

- Needs `NATS_URL`, `NATS_USER`, `NATS_PASSWORD`, `PIKKU_PROJECT`,
  `PIKKU_STAGE`. Any one missing, or a project or stage that is not
  `[a-z0-9]+(-[a-z0-9]+)*` (at most 63), refuses to start. No anonymous
  connection, no in-memory fallback.
- Subjects are `pikku.<project>.<stage>.<queue>`; schedules sit at
  `pikku.<project>.<stage>._schedule.<queue>.<task>`.
- The stream name joins project and stage with `_`, which the token rule
  forbids inside them, so `a-b`+`c` and `a`+`b-c` name different streams.
  Consumers use the library default names; the old `<project>_<stage>_` consumer
  prefix and its exact-name scoping are gone.
- Reply inboxes use `_INBOX.<project>.<stage>`.
- It provides `natsLifecycle`, not the factory (the server stops singleton
  services before stop hooks, which would close workers before they drain).
  `onServerStop` drains (10s), then closes.

## Permissions

Everything is scoped by the stage's stream name or subject prefix, so the list
does not depend on the app's queues (one `wf-orchestrator-<workflow>` per
workflow just works). Publish: `pikku.<p>.<s>.>`, `$JS.API.STREAM.INFO.<stream>`,
`$JS.API.STREAM.PURGE.<stream>`, `$JS.API.STREAM.MSG.GET.<stream>`,
`$JS.API.CONSUMER.CREATE.<stream>.>`, `$JS.API.CONSUMER.INFO.<stream>.>`,
`$JS.API.CONSUMER.MSG.NEXT.<stream>.>`, `$JS.ACK.<stream>.>`. Subscribe:
`_INBOX.<p>.<s>.>`. Not granted: stream create/update/delete, consumer delete,
`$JS.API.INFO`, stream list, anything on another stream.

Purge and message get are now safe to grant: the stream holds only the stage's
own subjects, so the worst a stage can do is purge its own queue. The scheduler
prunes orphaned schedules with a filtered purge again (the retire-by-republish
path is removed), and `getTask`/`getAllTasks` work.

The cross-stage schedule-target hole is closed: a schedule whose
`Nats-Schedule-Target` is outside the stream's subjects is refused by the server
("message schedules target is invalid"), and stage A cannot read B's stream
info, so no subject names or counts leak.

Removing a stage means dropping its user (reload) and deleting its stream;
dropping the user alone leaves the stream with its messages and consumers.

## Known limits

- Workflows are not covered. The in-memory workflow service keeps working next
  to NATS (its queue workers register on NATS, verified with a sleep step) but
  is not durable; durable needs workflowService, workflowRunService and
  leaseService on SQLite.
- A cron-only app has no queue capability, so `needsQueue` is false and it
  keeps the in-memory scheduler.
