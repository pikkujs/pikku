---
type: decision
title: The workflow run mirror is an observability sink, never a second source of truth
description: Every mirrored write happens after the authoritative write lands, and a mirror failure can never fail the workflow
tags: workflow
---

# The workflow run mirror is an observability sink, never a second source of truth

`WorkflowRunMirror` lets an executor shadow every state write to an external
read store — typically a DB the console UI queries while the run itself lives in
a Durable Object or Redis. Both properties that make it safe follow from the
single shape of `PikkuWorkflowService.mirrored()` in
`pikku-workflow-service.ts`: the mirror is only ever told about a write that has
already landed in the canonical store, and a mirror that is down or throwing is
caught, logged at warn, and otherwise invisible to the workflow. Even the log
call is wrapped, because singleton services may not be initialised yet.

Every public write method is a thin `mirrored(() => …Impl(...), (mirror) => …)`
pair over a `protected abstract` implementation. That pairing is the reason a
mirror method added to the interface but never wired into the service would
write nothing at runtime — `workflow-mirror.test.ts` spells out the full method
list to catch exactly that.

**What this rules out:** reading run or step state back from the mirror,
awaiting the mirror before returning the authoritative result, letting a mirror
rejection propagate, or writing to the mirror first so the two "stay in sync" —
any of which turns an index into a second, divergent source of truth that can
take the workflow down with it.
