import { z } from 'zod'
import { pikkuFunc } from '#pikku/function'

export const ListRunsInput = z.object({
  flowId: z.string().optional(),
  status: z
    .enum(['queued', 'running', 'succeeded', 'failed', 'cancelled'])
    .optional(),
  limit: z.number().int().min(1).max(100).default(25),
})

export const ListRunsOutput = z.object({
  runs: z.array(
    z.object({
      runId: z.string(),
      flowId: z.string(),
      flowName: z.string(),
      status: z.string(),
      startedBy: z.string(),
      startedAt: z.string(),
      finishedAt: z.string().nullable(),
      error: z.string().nullable(),
    })
  ),
})

// @snippet start readFunction
export const listRuns = pikkuFunc({
  expose: true,
  readonly: true,
  description: 'The run history, newest first, optionally filtered.',
  input: ListRunsInput,
  output: ListRunsOutput,
  // Everyone who works here can read runs — an analyst asking "did the
  // overnight sync work" should not need to ask an engineer.
  scopes: ['runs:read'],
  func: async ({ kysely }, { flowId, status, limit }) => {
    let query = kysely
      .selectFrom('flowRun')
      .innerJoin('flow', 'flow.flowId', 'flowRun.flowId')
      .select([
        'flowRun.runId',
        'flowRun.flowId',
        'flow.name as flowName',
        'flowRun.status',
        'flowRun.startedBy',
        'flowRun.startedAt',
        'flowRun.finishedAt',
        'flowRun.error',
      ])
      .orderBy('flowRun.startedAt', 'desc')
      .limit(limit)

    if (flowId) query = query.where('flowRun.flowId', '=', flowId)
    if (status) query = query.where('flowRun.status', '=', status)

    return { runs: await query.execute() }
  },
})
// @snippet end readFunction
