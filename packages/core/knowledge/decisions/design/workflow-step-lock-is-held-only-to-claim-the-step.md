---
type: decision
title: A workflow step lock is held only to claim the step, never across its execution
description: Holding the advisory lock — and its pooled connection — across step work exhausted the connection pool and self-deadlocked
tags: workflow
---

# A workflow step lock is held only to claim the step, never across its execution

`executeWorkflowStep` in `pikku-workflow-service.ts` takes `withStepLock` for an
atomic check-and-mark-running only: it reads the step, returns `null` if the
step already `succeeded` or is already `running` (another worker owns it),
starts a fresh attempt if it `failed`, and otherwise marks it `running`. The
lock is then released, and the actual work plus result persistence run outside
it.

The guard is what makes that safe — once a step is `running`, any concurrent
worker returns early. The alternative was tried and failed: holding the advisory
lock, and therefore its pooled connection, across `executeGraphStep` (network
I/O plus further pool queries) let concurrent steps exhaust the connection pool
and self-deadlock.

**What this rules out:** widening the `withStepLock` callback to cover RPC
invocation, child-workflow start, `setStepResult` or `resumeWorkflow` — the
"obviously safer" refactor that reintroduces the deadlock. If a stronger
guarantee is ever needed it has to come from the claim itself, not from a longer
lock hold.
