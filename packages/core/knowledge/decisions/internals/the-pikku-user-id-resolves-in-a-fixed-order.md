---
type: decision
title: The pikku user id resolves in a fixed order
description: defaultPikkuUserIdResolver takes an explicit pikkuUserId first, then the session userId, then the queue job's id, then the workflow's id
tags: core, identity
---

# The pikku user id resolves in a fixed order

`defaultPikkuUserIdResolver` in `packages/core/src/services/pikku-user-id.ts:5-12`
returns the first of these that is set:

1. `wire.pikkuUserId` (`:6`);
2. `wire.session.userId`, when it is a string (`:7-9`);
3. `wire.queue.pikkuUserId` (`:10`);
4. `wire.workflow.pikkuUserId` (`:11`).

Otherwise it returns `undefined` (`:12`).

The queue case is about the producer's identity carried on a job, and is covered in
`queue-job-identities-are-signed-at-enqueue.md`. This note records only the order.

**What this rules out:** a session user id overriding an explicit `pikkuUserId` set
on the wire, and a queue or workflow id outranking a live session.
