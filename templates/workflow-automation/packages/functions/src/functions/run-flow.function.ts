import { z } from 'zod'
import { pikkuFunc } from '#pikku/function'
import { randomUUID } from 'node:crypto'

export const RunFlowInput = z.object({
  flowId: z.string(),
  payload: z.record(z.string(), z.unknown()).optional(),
})

export const RunFlowOutput = z.object({
  runId: z.string(),
  flowVersionId: z.string(),
  status: z.string(),
})

// @snippet start writeFunction
export const runFlow = pikkuFunc({
  expose: true,
  description: 'Start a flow by hand against its currently published version.',
  input: RunFlowInput,
  output: RunFlowOutput,
  // Running is its own scope, separate from editing. Somebody who can start a
  // flow can cause whatever that flow does; somebody who can edit one changes
  // what it does for everybody. Plenty of operators should hold the first only.
  scopes: ['flows:run'],
  audit: true,
  func: async ({ kysely, queueService }, { flowId, payload }, { session }) => {
    const flow = await kysely
      .selectFrom('flow')
      .select(['flowId', 'status'])
      .where('flowId', '=', flowId)
      .executeTakeFirstOrThrow()

    if (flow.status === 'archived') {
      throw new Error('Cannot run an archived flow')
    }

    // Runs pin the *version*, not the flow. A run six months old still points
    // at the graph it actually executed, so it can be explained after the flow
    // has been edited twenty times.
    const version = await kysely
      .selectFrom('flowVersion')
      .select(['flowVersionId'])
      .where('flowId', '=', flowId)
      .orderBy('version', 'desc')
      .executeTakeFirstOrThrow()

    const runId = randomUUID()

    await kysely
      .insertInto('flowRun')
      .values({
        runId,
        flowId,
        flowVersionId: version.flowVersionId,
        status: 'queued',
        startedBy: 'manual',
        triggerPayload: payload ? JSON.stringify(payload) : null,
      })
      .execute()

    // Queued rather than executed inline: a flow can take minutes and the
    // caller is a person waiting on an HTTP response.
    await queueService.add('execute-flow-run', { runId, actorId: session.userId })

    return { runId, flowVersionId: version.flowVersionId, status: 'queued' }
  },
})
// @snippet end writeFunction
