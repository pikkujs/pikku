# Pikku Workflow Reference

## Step execution: inline vs queue dispatch

Whether a step runs **inline** (same process/session, no queue round-trip) or is **dispatched to the queue** is decided **purely by the step's function** — there is no workflow-level or per-call dispatch flag. `workflow.do(...)` options are only `description`/`retries`/`retryDelay`/`compensate: false`.

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

That record is deleted with the run (`deleteRun` cascades to steps and history), and a _refused_ attempt never reaches a step. So every answer is also written to the audit sink as `workflow.approval.decided`, with `outcome: 'success' | 'denied'`, the decider under `userIdentity`, and the run, reason and refusal in `metadata`. Wire an `audit` service to keep it; a project without one records nothing and is otherwise unaffected.
