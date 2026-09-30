/**
 * Workflows whose step takes its worker down with it.
 *
 * `crashProneStep` records that it started, then hangs for its first `crashes`
 * attempts so the crash-reclaim runner can SIGKILL the worker running it. An
 * attempt past that returns. The attempt is counted from the start markers
 * rather than read off the wire, because a graph node is handed no
 * `workflowStep` wire to read it from.
 */
import { pikkuWorkflowFunc } from '#pikku/workflow/pikku-workflow-types.gen.js'
import { pikkuSessionlessFunc } from '#pikku/function'
import { recordStepStart } from '../runners/crash-reclaim-markers.js'

export const crashProneStep = pikkuSessionlessFunc<
  { crashes: number },
  { attempt: number; pid: number }
>({
  workflowQueued: true,
  func: async ({ variables }, data, { workflowStep, graph }) => {
    const runId = workflowStep?.runId ?? graph!.runId
    const attempt = recordStepStart(
      (await variables.get('CRASH_MARKER_DIR'))!,
      runId,
      process.pid
    )
    if (attempt <= data.crashes) {
      await new Promise(() => {})
    }
    return { attempt, pid: process.pid }
  },
})

export const crashReclaimWorkflow = pikkuWorkflowFunc<
  { crashes: number },
  { attempt: number; pid: number }
>({
  func: async (_services, data, { workflow }) => {
    return await workflow.do('crash-prone step', 'crashProneStep', data, {
      retries: 1,
    })
  },
  tags: ['test', 'crash'],
})
