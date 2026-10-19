---
type: question
title: Should a delayed RPC run as the session captured when it was scheduled?
description: scheduleRPC writes the caller's session into the pg-boss job payload, and getTask returns it; this file does not contain the consumer that runs the job
tags: [pg-boss, scheduling, sessions]
---

# Should a delayed RPC run as the session captured when it was scheduled?

`scheduleRPC` in `packages/services/queue-pg-boss/src/pg-boss-scheduler-service.ts`
takes an optional `session` (`pg-boss-scheduler-service.ts:48-53`). It writes
`{ rpcName, data, session }` into the job data (`pg-boss-scheduler-service.ts:58-62`)
and sends it to the `pikku-mesh-rpc` queue with a `startAfter` time
(`pg-boss-scheduler-service.ts:65-72`).

`getTask` reads the same job back and returns `session: jobData.session`
(`pg-boss-scheduler-service.ts:102-109`).

The job runs later, after the caller's session may have expired or changed. This
file contains no consumer for `pikku-mesh-rpc`. The queue name appears
only in the send, cancel and lookup calls (`pg-boss-scheduler-service.ts:66`,
`:85`, `:94`). So this note did not read how the job is executed, or whether the
stored session is used to authorize it.

Open: is the session captured at scheduling time meant to be the identity the delayed
call runs as? The code stores it, but the file does not say what the consumer does
with it.
