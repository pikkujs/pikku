import { z } from 'zod'
import { pikkuSessionlessFunc } from '../../../.pikku/function/index.js'
import { resolveApiContext } from '../lib/config.js'
import { getCloudRPC } from '../lib/http.js'
import { table, removed, dim } from '../lib/output.js'
import { CloudPreconditionError } from '../lib/errors.js'

export const CloudErrorsInput = z.object({
  branch: z.string().default('main'),
  function: z.string().optional(),
})

export const CloudErrorsOutput = z.object({
  branch: z.string(),
  errors: z.array(z.any()),
})

/**
 * Recent error-level events for a stage — minimal and actionable, not a
 * persisted/grouped error tracker. Each row carries a traceId so you can hand
 * off to `pikku cloud trace <traceId>`. Reuses the existing logs RPC.
 */
export const CloudErrors = pikkuSessionlessFunc({
  description: 'Show recent error-level events for a branch (with traceIds)',
  input: CloudErrorsInput,
  output: CloudErrorsOutput,
  func: async (_services, { branch, function: functionName }) => {
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
    const { logs } = await rpc.invoke('getFabricLogsByStageKind', {
      projectId: ctx.projectId,
      branch,
      level: 'error',
      ...(functionName ? { functionName } : {}),
    })
    return { branch, errors: logs }
  },
})

type ErrorRow = {
  timestamp: string
  functionName: string
  message: string
  traceId?: string
}

export const renderErrors = (
  _s: unknown,
  { branch, errors }: { branch: string; errors: ErrorRow[] }
): void => {
  if (errors.length === 0) {
    console.log(dim(`No errors for ${branch}.`))
    return
  }
  console.log(
    table(
      ['WHEN', 'FUNCTION', 'TRACE', 'MESSAGE'],
      errors.map((l) => [
        l.timestamp,
        l.functionName,
        l.traceId ?? '',
        removed(l.message.replace(/\s+/g, ' ').slice(0, 100)),
      ])
    )
  )
}
