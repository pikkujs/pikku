---
'@pikku/core': patch
'@pikku/skills': patch
---

A workflow pass or step worker that lost its lease no longer records what it then throws. Losing the run lease used to burn the remaining retries on attempts that started already aborted, then fail the run or compensate it.

- After a lost run or step lease nothing records a step failure, a retry, a run status, a compensation or a child's outcome. The step stays `running` for the next owner, which runs it as another attempt or fails it with `WorkflowStepLeaseExpiredError` when none are left. Closure and compensation steps count that attempt too.
- An inline run, and an unwind `cancelRun` is driving, take the lease again and carry on, up to three times, then enqueue a wake where there is a queue. With no queue and no recovery, a run whose lease cannot be taken again stays `running`.
- A queued worker that lost its step lease wakes the run instead of failing the step. The wake is delayed by a lease, and repeats while that attempt still reads as leased.
- An inline step or compensation left `failed` with retries remaining, by a pass that lost its lease or died before creating the next attempt, spends a retry when replayed instead of failing the run or ending `compensation_failed`. Inline graph nodes are not covered.
- On a store whose run lease is a pass-through, a second pass leaves a closure step alone while the process is still working it, instead of running it again.
- Two passes of one run active at once now each get their own lease signal and step ordinals.
- A run cancelled or unwinding while a compensable step of a lost pass or queued worker is still `running` stays `compensating`.

A subclass of `PikkuWorkflowService` that overrides `withRunLease` should pass the lease's signal to the callback: `withRunLease(id, fn: (lost?: AbortSignal) => Promise<T>)`.

`PikkuWorkflowOrchestratorInput` has a new optional `awaitedStep` (`WorkflowAwaitedStep`). A custom orchestrator worker passes it on: `orchestrateWorkflow(runId, rpcService, awaitedStep)`.
