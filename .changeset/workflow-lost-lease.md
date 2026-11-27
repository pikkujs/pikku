---
'@pikku/core': patch
'@pikku/skills': patch
---

A workflow pass or step worker that lost its lease no longer records what it then throws. Losing the run lease used to burn the remaining retries on attempts that started already aborted, then fail the run or compensate it.

- After a lost run or step lease nothing records a step failure, a retry, a run status, a compensation or a child's outcome. The step stays `running` for the next owner, which runs it as another attempt or fails it with `WorkflowStepLeaseExpiredError` when none are left. Closure and compensation steps count that attempt too.
- An inline run, and an unwind `cancelRun` is driving, take the lease again and carry on, up to three times, then enqueue a wake where there is a queue. With no queue and no recovery, a run whose lease cannot be taken again stays `running`.
- A queued worker that lost its step lease wakes the run instead of failing the step.
- Two passes of one run active at once now each get their own lease signal and step ordinals.
- A run cancelled or unwinding while a lost pass's compensable step is still `running` stays `compensating`.

A subclass of `PikkuWorkflowService` that overrides `withRunLease` should pass the lease's signal to the callback: `withRunLease(id, fn: (lost?: AbortSignal) => Promise<T>)`.
