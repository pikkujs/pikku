import { z } from 'zod'
import { pikkuSessionlessFunc } from '#pikku'
import { resolveApiContext } from '../lib/config.js'
import { getRpc } from '../lib/http.js'

export const FabricTraceInput = z.object({
  stage: z.enum(['preview', 'production']),
  traceId: z.string(),
  json: z.boolean().optional(),
})

export const FabricTraceOutput = z.object({ count: z.number() })

interface TraceEvent {
  timestamp: string
  type: string
  scriptName: string
  wireType?: string
  wireId?: string
  level?: string
  message?: string
  outcome?: string
  totalDuration?: number
  errorMessage?: string
}

function formatEvent(e: TraceEvent): string {
  const dur =
    e.totalDuration !== undefined ? ` ${e.totalDuration.toFixed(0)}ms` : ''
  const wire = e.wireType ? ` ${e.wireType}:${e.wireId ?? ''}` : ''
  const detail = e.errorMessage ?? e.message ?? e.outcome ?? ''
  return `${e.timestamp} ${e.scriptName}${wire}${dur} — ${detail}`
}

export const FabricTrace = pikkuSessionlessFunc({
  description: 'Fetch all events for a single trace id across an environment.',
  input: FabricTraceInput,
  output: FabricTraceOutput,
  func: async (_services, { stage, traceId, json }) => {
    const ctx = await resolveApiContext()
    if (!ctx.token)
      throw new Error('Not logged in. Run `pikku fabric login` first.')
    if (!ctx.projectId)
      throw new Error(
        'No fabric project linked. Run `pikku fabric link` first.'
      )

    const rpc = getRpc({ apiUrl: ctx.apiUrl, token: ctx.token })
    const res = await rpc.invoke('getTraceByStageKind', {
      projectId: ctx.projectId,
      kind: stage,
      traceId,
    })

    if (json) {
      console.log(
        JSON.stringify({ stage, traceId, events: res.events }, null, 2)
      )
    } else if (res.events.length === 0) {
      console.log(`[fabric] no events for trace ${traceId} on ${stage}`)
    } else {
      for (const e of res.events) console.log(formatEvent(e as TraceEvent))
    }
    return { count: res.events.length }
  },
})
