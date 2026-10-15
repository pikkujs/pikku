---
type: decision
title: An app-wired job inbox replaces the runtime dispatch shim
description: When an app wires the remote queue-job or scheduler-job route itself, the Cloudflare adapter stops mounting its own shim ahead of routing
tags: [deploy, cloudflare, remote-jobs]
---

# An app-wired job inbox replaces the runtime dispatch shim

`REMOTE_JOB_INBOX_PATHS` in `packages/deploy/deploy-core/src/remote-job-inbox.ts`
(lines 9-12) lists `/__pikku/queue-job` and `/__pikku/scheduler-job`. The function
`unitWiresRemoteJobInbox` (lines 22-29) returns true when a fetch handler of the unit
has a route on one of those paths.

The comment at lines 17-20 says the runtime's own inbox would shadow the wired one,
"along with any middleware in front of it", so the shim stands down.

In `packages/deploy/deploy-cloudflare/src/adapter.ts`, `resolveHttpQueueJobs` returns
`this.httpQueueJobs && !unitWiresRemoteJobInbox(unit)` (lines 171-173). The comment at
lines 165-170 says the same thing.

The wiring the CLI generates (`packages/cli/src/functions/wirings/remote-jobs/serialize-remote-jobs.ts`,
lines 67-83) registers both routes with `middleware: [remoteJobsSecret]` (lines 73
and 82). So the app's wiring carries its own guard, and the runtime shim is not the
only check.

**What this rules out:** the runtime shim running in front of an app's own job
routes, where it would take over dispatch and skip the app's middleware.
