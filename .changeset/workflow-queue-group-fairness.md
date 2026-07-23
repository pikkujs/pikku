---
'@pikku/core': patch
'@pikku/queue-pg-boss': patch
'@pikku/queue-bullmq': patch
'@pikku/kysely': patch
'@pikku/redis': patch
'@pikku/mongodb': patch
---

Add job groups, so one shared queue can stay fair without splitting into one
queue per producer.

A job may now carry `group: { id, tier }`, and a worker may cap how many jobs
of any one group run at once via `groupConcurrency`. On pg-boss this maps to
`localGroupConcurrency`, which excludes at-capacity groups from the fetch query
itself, so a capped group costs nothing rather than being fetched and restored.
BullMQ declares it unsupported (groups are a BullMQ Pro feature) — being
push-based, it can simply use a queue per group at no polling cost.

Workflow services accept a `queueStrategy`. The default `'per-workflow'` is
unchanged: every workflow gets its own `wf-orchestrator-*` / `wf-step-*` queue,
which is also what lets serverless providers deploy one unit per workflow. The
new `'shared-groups'` routes every workflow through the shared
orchestrator/step-worker queues and isolates them by group instead, so a
monolith runs one set of pollers rather than one per workflow — on a
pull-based backend with dozens of workflows that is the difference between
hundreds of poll loops and twenty. It is for single-process runtimes only; a
per-unit serverless deploy still needs the per-workflow queues to route to its
units.
