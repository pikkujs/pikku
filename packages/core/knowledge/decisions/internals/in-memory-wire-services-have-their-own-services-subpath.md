---
type: decision
title: An in-memory wire service has its own services subpath, never the services barrel
description: InMemoryWorkflowService, InMemoryQueueService, InMemoryTriggerService and LocalGatewayService each reach their wire's runtime, so each is a @pikku/core/services/* subpath and the barrel stays at interfaces and light implementations
tags: core, services
---

# An in-memory wire service has its own services subpath

`InMemoryWorkflowService`, `InMemoryQueueService`, `InMemoryTriggerService` and
`LocalGatewayService` are exported from `@pikku/core/services/in-memory-workflow`,
`/in-memory-queue`, `/in-memory-trigger` and `/local-gateway`, not from
`@pikku/core/services`. Their sources live with their wire
(`src/wirings/<wire>/`), because each one extends or calls that wire's runtime.

Re-exported from the barrel, they made `@pikku/core/services` load 102 modules,
the workflow, queue, trigger and gateway runtimes among them, for an app that
only wanted a logger. An unbundled deploy loads whatever the import graph names.

They are subpaths of `services`, not of the wire (`@pikku/core/queue`), because
`pikku validate`'s core-import check lets an app name `@pikku/core/services` and
its subpaths only: picking a service implementation in bootstrap is the one
place an app reaches core directly. A wire subpath would be flagged, with a
`#pikku/<wire>` hint that does not carry the class.

`pikkuRemoteQueueJobFunc` and `pikkuRemoteScheduledJobFunc` are on
`@pikku/core/queue` and `@pikku/core/scheduler`: only CLI-generated code imports
them. The constants and payload types they share with `remoteJobsSecret` stay in
`services/remote-jobs.ts`, a leaf.

Enforced by `wirings-stay-decoupled.test.ts`: the services barrel may not reach
`wirings/` at runtime, and may load at most 45 modules.

**What this rules out:** re-exporting any of these from the barrel for
convenience, and moving a wire-runtime implementation into `src/services/`.
