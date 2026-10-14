---
type: question
title: Does a delayed RPC run as the session it was scheduled with?
description: The in-memory scheduler stores the session it is given and returns it from getTask, but the delayed run invokes the RPC with no session
tags: core, scheduler, sessions
---

# Does a delayed RPC run as the session it was scheduled with?

The contract takes an optional session. `SchedulerService.scheduleRPC` in
`packages/core/src/services/scheduler-service.ts:19-24` accepts `session`, and
`ScheduledTaskInfo` exposes it (`:9-13`).

The in-memory implementation in `packages/schedule/src/in-memory-scheduler-service.ts`
accepts it (`:41-46`), stores it on the delayed task (`:85-92`), and returns it from
`getTask` (`:107-118`). The timer callback runs `rpc.invoke(rpcName, data)` on a
context built with an empty wire (`:69-75`). The session is not passed to that
call, and the file does not read it on the run path.

The comment at `:67-68` says the BullMQ and pg-boss schedulers enqueue
`{ rpcName, data, session }` and invoke the RPC with it. This file does not do so.
The caller in the workflow sleeper passes no session (`packages/core/src/wirings/workflow/pikku-workflow-service.ts:852-856`).

**Question:** should a delayed RPC run under the session captured at scheduling
time, as the comment describes for the other schedulers, or run with none? The
code stores the session, reports it, and does not use it.
