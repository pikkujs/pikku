import { z } from 'zod'
import { pikkuSessionlessFunc } from '../../../.pikku/function/index.js'
import { resolveApiContext } from '../lib/config.js'
import { getCloudRPC } from '../lib/http.js'
import { CloudPreconditionError } from '../lib/errors.js'

export const CloudTraceInput = z.object({
  branch: z.string(),
  traceId: z.string(),
  json: z.boolean().optional(),
})

export const CloudTraceOutput = z.object({ count: z.number() })

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

export const CloudTrace = pikkuSessionlessFunc({
  description: 'Fetch all events for a single trace id across an environment.',
  input: CloudTraceInput,
  output: CloudTraceOutput,
  func: async (_services, { branch, traceId, json }) => {
    const ctx = await resolveApiContext()
    if (!ctx.token)
      throw new CloudPreconditionError(
        'Not logged in. Run `pikku cloud login` first.'
      )
    if (!ctx.projectId)
      throw new CloudPreconditionError(
        'No cloud project linked. Run `pikku cloud link` first.'
      )

    const rpc = getCloudRPC({ apiUrl: ctx.apiUrl, token: ctx.token })
    const res = await rpc.invoke('getTraceByStageKind', {
      projectId: ctx.projectId,
      branch,
      traceId,
    })

    if (json) {
      console.log(
        JSON.stringify({ branch, traceId, events: res.events }, null, 2)
      )
    } else if (res.events.length === 0) {
      console.log(`[cloud] no events for trace ${traceId} on ${branch}`)
    } else {
      for (const e of res.events) console.log(formatEvent(e as TraceEvent))
    }
    return { count: res.events.length }
  },
})
