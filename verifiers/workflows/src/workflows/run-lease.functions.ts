/**
 * A workflow whose run lease is held by another worker when its step finishes.
 *
 * The step takes `workflow-run:<runId>` as a stranger and keeps it for
 * `holdMs`, longer than the queue's whole retry budget for the orchestrator
 * message its own completion enqueues. The run can only finish if the
 * orchestrator waits for the lease rather than spending retries on it.
 */
import { pikkuWorkflowFunc } from '#pikku/workflow/pikku-workflow-types.gen.js'
import { pikkuSessionlessFunc } from '#pikku/function'
import { holdRunLease } from '../runners/run-lease-holder.js'

export const holdRunLeaseStep = pikkuSessionlessFunc<
  { holdMs: number },
  { held: boolean }
>({
  workflowQueued: true,
  func: async ({ leaseService }, data, { workflowStep }) => {
    await holdRunLease(leaseService!, workflowStep!.runId, data.holdMs)
    return { held: true }
  },
})

export const runLeaseWorkflow = pikkuWorkflowFunc<
  { holdMs: number },
  { ok: boolean }
>({
  func: async (_services, data, { workflow }) => {
    await workflow.do('hold the run lease', 'holdRunLeaseStep', data, {
      retries: 0,
    })
    return { ok: true }
  },
  tags: ['test', 'lease'],
})
