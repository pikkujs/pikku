---
type: question
title: Does one wired inbox route stand the whole shim down?
description: unitWiresRemoteJobInbox uses some(), so wiring only one of the two job routes turns off the runtime shim for both
tags: [deploy, remote-jobs]
---

# Does one wired inbox route stand the whole shim down?

`unitWiresRemoteJobInbox` in `packages/deploy/deploy-core/src/remote-job-inbox.ts`
returns true when `unit.handlers.some(...)` finds a fetch handler with a route whose
path is in `REMOTE_JOB_INBOX_PATHS` (lines 22-29). The check is `some` over the two
paths, not `every`.

`resolveHttpQueueJobs` in `packages/deploy/deploy-cloudflare/src/adapter.ts` uses that
result for the whole runtime shim (lines 171-172). The shim serves both
`/__pikku/queue-job` and `/__pikku/scheduler-job`.

So an app that wires only `queue-job` also loses the shim's `scheduler-job` route,
and the scheduler route is then served by nothing unless the app wires it too. The
code does not say whether that is intended. The doc comments (`remote-job-inbox.ts`
lines 14-21) talk about "the inbox" as one unit.

Question: should the shim stand down per route, or only when both routes are wired?
