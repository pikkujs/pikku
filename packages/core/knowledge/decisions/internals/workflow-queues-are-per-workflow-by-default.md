---
type: decision
title: Workflows get their own queues by default, and queue names are resolved from queue meta
description: Per-workflow queues stop one slow step head-of-line-blocking every other workflow; `shared-groups` trades that for one set of pollers
tags: workflow
---

# Workflows get their own queues by default, and queue names are resolved from queue meta

`WorkflowQueueOptions.queueStrategy` defaults to `'per-workflow'`: each workflow
gets its own `wf-orchestrator-*` and `wf-step-*` queue. That gives complete
isolation and is what lets serverless providers deploy one unit per workflow,
at the cost of one set of pollers per queue — which adds up on pull-based
backends. `'shared-groups'` puts every workflow on the shared orchestrator and
step-worker queues and keeps them isolated with a per-group concurrency cap, so
there is one set of pollers for the whole system. It is only for single-process
runtimes; a per-unit serverless deploy needs the per-workflow queues to route to
its units. The options are passed to the service constructor rather than read
from `config.workflow` because the queues are wired during construction, before
singleton services — and so before `config` — exist.

Under `'shared-groups'`, `getJobGroup` returns a group keyed by workflow name
(steps group by step function, mirroring how per-step queues split them). It
returns `undefined` under `'per-workflow'`, because the queue name already
isolates the workflow and a group would cap it inside its own dedicated queue.
The group tier repeats the id so a workflow can be given its own limit purely
from config; note tiers can only lower a limit, never raise it above `default`,
because the backend applies its pre-fetch exclusion per group using `default`
alone.

`getOrchestratorQueueName` and `getStepWorkerQueueName` read `queue.meta`, which
is always populated globally, rather than `queue.registrations`, which only
covers queues this unit consumes. In a per-unit deploy the orchestrator unit
produces to the per-step queues without consuming them, so registrations would
miss them. `wireQueueWorkers` warns loudly when workflows exist but no
`wf-orchestrator-*` queue is in meta: everything still "works" via the shared
fallback, but the isolation is gone and one slow step head-of-line-blocks every
other workflow — invisible until a queue starves.

**What this rules out:** defaulting to `'shared-groups'`, returning a job group
under `'per-workflow'`, resolving queue names from `queue.registrations`, or
dropping the wiring-time warning as noise.
