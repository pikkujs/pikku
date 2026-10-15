---
type: question
title: Should a delayed RPC run as the session it was scheduled with?
description: The in-memory scheduler stores the session with the task and returns it from getTask, but the timer runs the RPC without it
tags: [schedule, sessions, rpc]
---

# Should a delayed RPC run as the session it was scheduled with?

`scheduleRPC` in `packages/schedule/src/in-memory-scheduler-service.ts` takes an optional `session`
(line 45). It stores it on the task (lines 85-92), and `getTask` returns it (line 115).

The timer callback `run` (line 52) calls `rpcService.getContextRPCService(services, {}, false)` (lines 69-74)
and then `rpc.invoke(rpcName, data)` (line 75). The `session` is not passed to either call and is not in
scope inside `run`.

The comment at lines 67-68 says the BullMQ and pg-boss schedulers "enqueue `{ rpcName, data, session }`
and invoke the RPC with it". This file does not do that for the session.

Question: should the in-memory scheduler run the RPC as the captured session, as the comment says the other
schedulers do, or is a delayed RPC meant to run with no user? The code does not settle it, and no note in
this package records the choice.
