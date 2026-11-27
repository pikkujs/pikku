# Pikku Workflow Reference

## Step execution: inline vs queue dispatch

Whether a step runs **inline** (same process/session, no queue round-trip) or is **dispatched to the queue** is decided **purely by the step's function** — there is no workflow-level or per-call dispatch flag. `workflow.do(...)` options are only `description`/`retries`/`retryDelay`/`compensate: false`, plus `timeout` on a step that runs a function (see [Cancel and step deadlines](#cancel-and-step-deadlines)).

- **Steps default to inline.** Most steps don't need their own worker; running them inline avoids a queue round-trip per step, so a normally-started workflow executes its whole chain in one orchestrator pass.
- **`workflowQueued: true` opts a function out.** Set it on the **function config** (`pikkuFunc` / `pikkuSessionlessFunc`, same level as `auth`/`expose`) to dispatch that step via the queue — for expensive/long-running steps that deserve their own worker, retry isolation, and concurrency limits. `workflowRetries` and `workflowTimeout` sit alongside it.
- **Run-level `inline` is separate** and only controls whether the _whole run_ executes in-process without queue infrastructure (set automatically when there is no `queueService`, or via `startWorkflow(..., { inline: true })`). It governs sleep handling, not per-step dispatch.

The rule (`dispatchStep`):

| Function `workflowQueued` | `queueService` present? | Result                  |
| ------------------------- | ----------------------- | ----------------------- |
| default / `false`         | any                     | **inline**              |
| `true`                    | yes                     | **queued** (own worker) |
| `true`                    | no                      | **throws**              |

```typescript
// Push this one expensive step onto the queue; every other step stays inline:
export const renderLargeReport = pikkuSessionlessFunc({
  workflowQueued: true, // dispatch via queue instead of running inline
  workflowRetries: 3,
  workflowTimeout: '5m',
  input: ReportInput,
  output: ReportOutput,
  func: async (services, data) => {
    /* ... */
  },
})
```

`workflowQueued: true` **requires** a `queueService`. Without one the step throws
rather than quietly running inline — a step marked for its own worker usually
carries timeout and concurrency expectations that inline execution would silently
violate, so failing loudly is safer than proceeding.

## HTTP workflow wiring (manual)

Usually auto-scaffolded via `scaffold.workflow`. To wire by hand:

```typescript
// Start a workflow
wireHTTP({
  method: 'post',
  route: '/onboard',
  func: workflowStart('onboardUser'),
})

// Execute workflow steps (called by the orchestrator)
wireHTTP({
  method: 'post',
  route: '/onboard/run',
  func: workflow('onboardUser'),
})

// Check workflow status
wireHTTP({
  method: 'get',
  route: '/onboard/status/:runId',
  func: workflowStatus('onboardUser'),
})
```

## Suspend / resume example

```typescript
import { z } from 'zod'
import { pikkuWorkflowFunc } from '#pikku/workflow/pikku-workflow-types.gen.js'

export const approval = pikkuWorkflowFunc({
  description: 'Submit a request and wait for approval',
  input: z.object({ requestId: z.string() }),
  output: z.object({ approved: z.boolean() }),
  func: async (services, data, { workflow }) => {
    await workflow.do('Submit request', 'submitRequest', data)
    await workflow.suspend('Awaiting approval') // pauses here until externally resumed
    const result = await workflow.do('Check result', 'getApprovalResult', data)
    return { approved: result.approved }
  },
})
```

## Approval gates: enforcement and record

`workflow.approval` options are `schema` (a value, not a generic), `expiry`, `approvers` (`'any' | 'owner' | 'not-initiator'`) and `approverScope`. `WorkflowStepOptions` on `workflow.do` are the ones listed at the top of this file. Neither type, nor `WorkflowRunService`, is printed by `pikku doc`.

`approvers` and `approverScope` are enforced in two phases, because a decision can legitimately arrive before the run has reached the gate:

- **At submission**, if the run has reached the gate. Reaching it publishes the policy into the run state, so the approve entrypoint judges the caller and refuses with a **403**.
- **On replay**, for a decision that arrived before the gate: there was no policy yet, so it is accepted and judged when the workflow reaches the gate. Failing there discards the decision and leaves the gate closed, exactly as a decision that fails the schema does.

So the same rejected decision surfaces as an HTTP error or a silently re-closed gate depending on timing. Both are audited.

A settled decision carries `decidedBy` and `decidedAt`, so the answer keeps its provenance in the step result:

```typescript
if (signOff.status === 'decided') {
  logger.info(`signed by ${signOff.decidedBy?.userId} at ${signOff.decidedAt}`)
}
```

That record is deleted with the run (`deleteRun` cascades to steps and history), and a _refused_ attempt never reaches a step. So every answer is also written to the audit sink as `workflow.approval.decided`, with `outcome: 'success' | 'denied'`, the decider under `userIdentity`, and the run, reason and refusal in `metadata`. Wire an `audit` service to keep it; a project without one records nothing and is otherwise unaffected. Two limits: the event carries who answered and when, not the decision payload, so it cannot show afterwards whether the expense was approved or declined; and `success` is recorded before the answer is schema-validated, so an invalid answer can be logged as `success` while the gate stays open. When an audit trail needs the settled decision, write it yourself (in the answering function) to a record that outlives the run.

## Tracing

A run owns one trace, stored on `run.wire.traceparent`. It starts from the wire or
the caller's `rpc`; a start with neither, such as a trigger, gets a new trace. Every
step, retry, sleep wake-up, resume, child workflow, recovery and job a step
enqueues stays on it. Each hop is a new span whose parent is the span that started
the run. An agent's tool calls are the exception: they are not on the run's trace
yet.

## Cancel and step deadlines

A step that runs a function is handed `wire.workflowStep.signal`, an `AbortSignal` that is new for every attempt. Pass it to whatever can stop early:

```typescript
export const importFeed = pikkuSessionlessFunc({
  workflowQueued: true,
  func: async (_services, data, { workflowStep, abortScope }) => {
    const feed = await fetch(data.url, { signal: workflowStep?.signal })
    abortScope?.beginChanges() // throws AbandonedError once the signal is aborted
    await save(await feed.json(), workflowStep!.invocationId)
  },
})
```

It aborts for three things, and `signal.reason` says which:

| Cause                                                              | `signal.reason`              |
| ------------------------------------------------------------------ | ---------------------------- |
| The run was cancelled, including while it then compensates         | `WorkflowStepCancelledError` |
| The attempt passed its `timeout`                                   | `WorkflowStepTimeoutError`   |
| The worker lost the step's lease, or an inline pass lost the run's | `LeaseLostError`             |

Another step failing does not abort a running step, although the run then starts compensating. A completed or failed run is not a cancel.

- **Cooperative only.** Nothing is killed: a function that ignores the signal runs on. The signal does not cross a remote RPC transport, so a step served by another deployment never sees it abort.
- **How fast.** A cancel made by the same process aborts at once. From another process, the worker reads the run every 20s, or every third of the step's lease when that is shorter.
- **Compensation is never stopped by a cancel,** running or queued, and a second cancel changes nothing. Only a lost lease aborts its signal. It does not inherit its step's `timeout`.
- **When the unwind runs.** One driver at a time, under the run lease. While a pass holds the lease, `cancelRun` returns without compensating and that pass unwinds before it lets go.
- **Child workflows** are cancelled with their parent, including one being started as the cancel lands.
- **After a cancel,** a step that throws is recorded failed, is not retried, and the run goes on to unwind. A step that returns keeps its result, so its `compensate` has it. The run's status never moves back from `cancelled` or the unwinding statuses.
- **A queued step delivered to a run that is `cancelled` or unwinding,** for any cause, never runs. It is recorded failed with `WorkflowRunStoppedError`. The same goes for an inline step or retry that has not started. A step refused on its first attempt never ran, so its `compensate` is not called; a refused retry follows an attempt that did run and is still compensated. Compensation jobs still run.
- **The unwind does not wait for a step with no `compensate`** that is still running.

`timeout` (`'30s'`, or milliseconds; no default) bounds one attempt of a step that runs a function, queued or inline: `workflow.do('Fetch', 'importFeed', data, { retries: 2, timeout: '30s' })`. It is stored with the step, so a job that is sent again keeps it. Past it the signal aborts and the attempt fails with `WorkflowStepTimeoutError` without waiting for the function; the usual retries apply and anything the abandoned call returns later is discarded. That call may still be running when the retry starts, so make the step's side effects idempotent on `workflowStep.invocationId`. A child-workflow step with a `timeout` fails the run, as does a value that is not at least one millisecond and under about 24.8 days. Closure and `expect*` steps do not accept it.

**Not covered:** graph steps get the signal but take no `timeout`. Agent steps get no signal, and a step's abort does not reach an agent it runs, whose tool calls have their own `wire.abortScope`. Cloudflare Durable Object workflows give no signal, and setting `timeout` there is an error.

## Restarts

A run survives a crash or deploy. `pikku dev` and `pikku serve` recover it at startup and every 30s: a sleep keeps its deadline, and a step caught in flight runs again as a new attempt. A settled step never reruns. So a step can run more than once: make its side effects idempotent on `workflowStep.invocationId`, which stays the same across attempts within one run. Separate runs for the same operation (duplicate deliveries that each start a run) get different ids, so an effect that must be unique across runs, such as a charge, takes a stable key for the business operation (`order-${orderId}-charge`) instead. A step with `retries: 0` caught in flight fails instead, and so does a lost step of a run that is `cancelled` or unwinding: it is not run again. Compensations are, however the run stands. On the Kysely and in-memory stores, recovery also finishes a parent whose child settled without telling it and resumes an approval that was decided but never resumed. It sends a `compensating` run only its compensation jobs again, so one waiting on a lost forward job stays waiting. Any other host calls `workflowService.startRecovery()` once the queue is consuming. Set `workflow.recovery: false` to turn it off.
