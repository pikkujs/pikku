---
type: decision
title: A delayed RPC job carries the caller's session in its data, and a recurring job carries none
description: BullSchedulerService stores the session in the job data and returns it from getTask, while the recurring worker runs the task by name alone
tags: bullmq, scheduler, sessions, rpc
---

# A delayed RPC job carries the caller's session in its data, and a recurring job carries none

`BullSchedulerService` in `packages/services/queue-bullmq/src/bull-scheduler-service.ts` defines the job data
as `{ rpcName, data?, session? }` (lines 17-21).

**Delayed.** `scheduleRPC` takes an optional `session` (line 56) and puts it in the job data (lines 62-66). The
job is added to the `pikku-mesh-rpc` queue with the delay (lines 69-72). `getTask` returns the stored
`session` (line 116). `getAllTasks` returns only the id, rpc name and time (lines 133-137). The session is
therefore stored in Redis with the job.

**What runs it.** This file has no worker for that queue. The CLI generates one, `meshRPCHandler`, whose
function destructures only `{ rpcName, data }` and calls `rpc.invoke(rpcName, data)`
(`packages/cli/src/functions/wirings/rpc/serialize-mesh-rpc.ts:37-39`). It is wired to the queue at lines
43-47 of the same file. Nothing in that handler reads the job's `session`.

**Recurring.** `start` creates a worker on `pikku-recurring-scheduled-task` (lines 161-169) that calls
`runScheduledTask({ name: rpcName })` (line 166). The job data written for each task is `{ rpcName: name }`
(line 179), so there is no session to carry.

The same question for the in-memory scheduler is open in
[does-a-delayed-rpc-run-as-the-session-it-was-scheduled-with](../../../../core/knowledge/questions/does-a-delayed-rpc-run-as-the-session-it-was-scheduled-with.md).

**What this rules out:** reading `getTask().session` as evidence that the delayed run executes as that user,
and putting anything secret in a session passed to `scheduleRPC`, since it is stored in the job data.
