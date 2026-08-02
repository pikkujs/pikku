---
type: decision
title: A suspend or approval `reason` is the step's durable identity, not just a message
description: The reason is namespaced and used raw as the step key, so it must be derived deterministically across replays
tags: workflow
---

# A suspend or approval `reason` is the step's durable identity, not just a message

`getSuspendStepName` and `getApprovalStepName` in `pikku-workflow-service.ts`
derive a step key from the `reason` string — `__workflow_suspend:<reason>` and
`__workflow_approval:<reason>`. Each distinct reason is therefore its own step
row, which is what lets one workflow hold several independent suspends
(wait-for-build, then wait-for-approval) and lets a dynamic reason inside a loop
work exactly like a dynamic `do()` step name. The two prefixes are separate
namespaces so a suspend, an approval, and a `do`/`sleep` step of the same name
cannot collide.

Because the reason IS the identity, it must be derived deterministically: the
same replay must produce the same reason at the same point, or the run mints a
new suspend instead of finding the one it is waiting on. This is the same
contract as `do()` and `sleep()` step names.

An approval additionally stores its record under a run-state key built by
`approvalStateKey`, which hex-encodes the step name. The Mongo backend restricts
state keys to `/^[a-zA-Z0-9_]+$/` while a reason is arbitrary human text, and
one key per gate means two gates resolving concurrently cannot clobber each
other through a read-modify-write.

One consequence to know about: `approveStep`'s optional `reason` argument
addresses the *first* reach of a gate only. If a gate is reached again on a
later loop iteration, `nextStepKey` gives that row a `#N` suffix, and there is
currently no way for a caller to name it.

**What this rules out:** deriving a reason from a timestamp, a random id or
anything else that varies between replays; sharing one namespace (or one
run-state key) between suspends and approvals; and storing the reason raw as a
run-state key, which breaks on any backend that constrains key characters.
