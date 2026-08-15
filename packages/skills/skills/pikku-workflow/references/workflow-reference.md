# Pikku Workflow Reference

## Step execution: inline vs queue dispatch

Whether a step runs **inline** (same process/session, no queue round-trip) or is **dispatched to the queue** is decided **purely by the step's function** — there is no workflow-level or per-call dispatch flag. `workflow.do(...)` options are only `description`/`retries`/`retryDelay`/`onError`.

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
