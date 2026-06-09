import { z } from 'zod'
import chalk from 'chalk'
import { pikkuSessionlessFunc } from '../../../.pikku/pikku-types.gen.js'
import { resolveApiContext } from '../lib/config.js'
import { getFabricRPC } from '../lib/http.js'
import { dim, table } from '../lib/output.js'

export const FabricMetricsInput = z.object({
  branch: z.string(),
  hours: z.number().optional(),
  function: z.string().optional(),
})

const MetricRow = z.object({
  timestamp: z.string(),
  requests: z.number(),
  errors: z.number(),
  avgDuration: z.number(),
  minDuration: z.number(),
  maxDuration: z.number(),
})

export const FabricMetricsOutput = z.object({
  branch: z.string(),
  hours: z.number(),
  rows: z.array(MetricRow),
})

type MetricRow = z.infer<typeof MetricRow>

export const renderMetrics = (
  _s: unknown,
  { branch, hours, rows }: z.infer<typeof FabricMetricsOutput>
): void => {
  if (rows.length === 0) {
    console.log(dim(`No metrics for ${branch} in the last ${hours}h.`))
    return
  }
  console.log(
    table(
      ['TIME', 'REQS', 'ERRS', 'ERR%', 'AVG', 'MIN', 'MAX'],
      rows.map((r: MetricRow) => {
        const errPct = r.requests > 0
          ? ((r.errors / r.requests) * 100).toFixed(1) + '%'
          : '0.0%'
        const errCell = r.errors > 0 ? chalk.red(String(r.errors)) : String(r.errors)
        return [
          r.timestamp,
          String(r.requests),
          errCell,
          r.errors > 0 ? chalk.red(errPct) : dim(errPct),
          `${r.avgDuration.toFixed(0)}ms`,
          dim(`${r.minDuration.toFixed(0)}ms`),
          dim(`${r.maxDuration.toFixed(0)}ms`),
        ]
      })
    )
  )
}

export const FabricMetrics = pikkuSessionlessFunc({
  description: 'Fetch aggregated request metrics for a stage via fabric-api.',
  input: FabricMetricsInput,
  output: FabricMetricsOutput,
  func: async (_services, { branch, hours, function: functionName }) => {
    const ctx = await resolveApiContext()
    if (!ctx.token)
      throw new Error('Not logged in. Run `pikku fabric login` first.')
    if (!ctx.projectId)
      throw new Error(
        'No fabric project linked. Run `pikku fabric link` first.'
      )

    const rpc = getFabricRPC({ apiUrl: ctx.apiUrl, token: ctx.token })
    const res = await rpc.invoke('getProjectMetricsByStageKind', {
      projectId: ctx.projectId,
      branch,
      hours,
      functionName,
    })

    return {
      branch,
      hours: hours ?? 24,
      rows: res.metrics as MetricRow[],
    }
  },
})
