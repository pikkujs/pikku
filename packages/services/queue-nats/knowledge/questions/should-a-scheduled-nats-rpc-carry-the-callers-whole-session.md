---
type: question
title: Should a scheduled NATS RPC carry the caller's whole session?
description: scheduleRPC puts the full session into the scheduled message body, and getTask and getAllTasks return it to whoever lists the schedules
tags: [nats, scheduling, sessions]
---

# Should a scheduled NATS RPC carry the caller's whole session?

`scheduleRPC` in `packages/services/queue-nats/src/nats-scheduler-service.ts` takes
`session?: CoreUserSession` (`nats-scheduler-service.ts:161-166`). The message body is
`JSON.stringify({ rpcName, data, session } satisfies ScheduledJobData)`
(`nats-scheduler-service.ts:181-184`). The session therefore lives in the broker's
stream until the message fires or is purged.

Reading a schedule back returns the same session. `getTask` returns
`session: jobData.session` (`nats-scheduler-service.ts:214-222`). `getAllTasks` lists
every subject and calls `getTask` on each (`nats-scheduler-service.ts:236-244`), so a
listing carries every stored session too.

The file does not say whether the consumer of the scheduled message runs the call
under this session, or whether a shorter-lived credential was meant to be used. The
pg-boss scheduler in `packages/services/queue-pg-boss` stores the same kind of
session (see its own question note), so this is a choice made in both places.

Open: should the whole session be stored and listed, or only the identity needed to
run the call? The code does not state which.
