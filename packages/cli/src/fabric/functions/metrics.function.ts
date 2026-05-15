import { z } from 'zod'
import { pikkuSessionlessFunc } from '../../../.pikku/pikku-types.gen.js'
import { resolveApiContext } from '../lib/config.js'
import { getRpc } from '../lib/http.js'

export const FabricMetricsInput = z.object({
  branch: z.string(),
  hours: z.number().optional(),
  function: z.string().optional(),
  json: z.boolean().optional(),
})

export const FabricMetricsOutput = z.object({ count: z.number() })

interface MetricRow {
  timestamp: string
  requests: number
  errors: number
  avgDuration: number
  minDuration: number
  maxDuration: number
}

function formatRow(row: MetricRow): string {
  const errRate =
    row.requests > 0 ? ((row.errors / row.requests) * 100).toFixed(1) : '0.0'
  return `${row.timestamp}  reqs=${String(row.requests).padStart(5)}  err=${String(row.errors).padStart(4)} (${errRate}%)  avg=${row.avgDuration.toFixed(0)}ms  min=${row.minDuration.toFixed(0)}ms  max=${row.maxDuration.toFixed(0)}ms`
}

export const FabricMetrics = pikkuSessionlessFunc({
  description: 'Fetch aggregated request metrics for a stage via fabric-api.',
  input: FabricMetricsInput,
  output: FabricMetricsOutput,
  func: async (_services, { branch, hours, function: functionName, json }) => {
    const ctx = await resolveApiContext()
    if (!ctx.token)
      throw new Error('Not logged in. Run `pikku fabric login` first.')
    if (!ctx.projectId)
      throw new Error(
        'No fabric project linked. Run `pikku fabric link` first.'
      )

    const rpc = getRpc({ apiUrl: ctx.apiUrl, token: ctx.token })
    const res = await rpc.invoke('getProjectMetricsByStageKind', {
      projectId: ctx.projectId,
      branch,
      hours,
      functionName,
    })

    if (json) {
      const wireTypes = Object.fromEntries(
        (res.wireTypes ?? []).map((r: { wireType: string; requests: number }) => [r.wireType, r.requests]),
      )
      console.log(JSON.stringify({ branch, metrics: res.metrics, wireTypes }, null, 2))
    } else if (res.metrics.length === 0) {
      console.log(
        `[fabric] no metrics for ${branch} in the last ${hours ?? 24}h`
      )
    } else {
      for (const row of res.metrics) console.log(formatRow(row as MetricRow))
    }
    return { count: res.metrics.length }
  },
})
