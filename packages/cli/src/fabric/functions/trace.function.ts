import { z } from 'zod'
import chalk from 'chalk'
import { pikkuSessionlessFunc } from '../../../.pikku/pikku-types.gen.js'
import { resolveApiContext } from '../lib/config.js'
import { getFabricRPC } from '../lib/http.js'
import { dim, statusColor } from '../lib/output.js'

export const FabricTraceInput = z.object({
  branch: z.string(),
  traceId: z.string(),
})

const TraceEvent = z.object({
  timestamp: z.string(),
  type: z.string(),
  scriptName: z.string(),
  wireType: z.string().optional(),
  wireId: z.string().optional(),
  level: z.string().optional(),
  message: z.string().optional(),
  outcome: z.string().optional(),
  totalDuration: z.number().optional(),
  errorMessage: z.string().optional(),
})

export const FabricTraceOutput = z.object({
  branch: z.string(),
  traceId: z.string(),
  events: z.array(TraceEvent),
})

type TraceEvent = z.infer<typeof TraceEvent>

export const renderTrace = (
  _s: unknown,
  { branch, traceId, events }: z.infer<typeof FabricTraceOutput>
): void => {
  if (events.length === 0) {
    console.log(dim(`No events for trace ${traceId} on ${branch}.`))
    return
  }
  for (const e of events) {
    const dur = e.totalDuration !== undefined
      ? dim(` ${e.totalDuration.toFixed(0)}ms`)
      : ''
    const wire = e.wireType
      ? ` ${chalk.blue(e.wireType)}${e.wireId ? dim(':' + e.wireId) : ''}`
      : ''
    const outcome = e.outcome ? ` ${statusColor(e.outcome)}` : ''
    const detail = e.errorMessage
      ? chalk.red(e.errorMessage)
      : e.message ?? ''
    console.log(
      `${dim(e.timestamp)} ${chalk.bold(e.scriptName)}${wire}${dur}${outcome}${detail ? ' — ' + detail : ''}`
    )
  }
}

export const FabricTrace = pikkuSessionlessFunc({
  description: 'Fetch all events for a single trace id across an environment.',
  input: FabricTraceInput,
  output: FabricTraceOutput,
  func: async (_services, { branch, traceId }) => {
    const ctx = await resolveApiContext()
    if (!ctx.token)
      throw new Error('Not logged in. Run `pikku fabric login` first.')
    if (!ctx.projectId)
      throw new Error(
        'No fabric project linked. Run `pikku fabric link` first.'
      )

    const rpc = getFabricRPC({ apiUrl: ctx.apiUrl, token: ctx.token })
    const res = await rpc.invoke('getTraceByStageKind', {
      projectId: ctx.projectId,
      branch,
      traceId,
    })

    return {
      branch,
      traceId,
      events: res.events as TraceEvent[],
    }
  },
})
