import { z } from 'zod'
import { pikkuSessionlessFunc } from '../../../.pikku/pikku-types.gen.js'
import { resolveApiContext } from '../lib/config.js'
import { getRpc } from '../lib/http.js'
import { table, removed, dim } from '../lib/output.js'

export const FabricErrorsInput = z.object({
  branch: z.string().default('main'),
  function: z.string().optional(),
})

export const FabricErrorsOutput = z.object({
  branch: z.string(),
  errors: z.array(z.any()),
})

/**
 * Recent error-level events for a stage — minimal and actionable, not a
 * persisted/grouped error tracker. Each row carries a traceId so you can hand
 * off to `pikku fabric trace <traceId>`. Reuses the existing logs RPC.
 */
export const FabricErrors = pikkuSessionlessFunc({
  description: 'Show recent error-level events for a branch (with traceIds)',
  input: FabricErrorsInput,
  output: FabricErrorsOutput,
  func: async (_services, { branch, function: functionName }) => {
    const ctx = await resolveApiContext()
    if (!ctx.token)
      throw new Error('Not logged in. Run `pikku fabric login` first.')
    if (!ctx.projectId)
      throw new Error('No fabric project linked. Run `pikku fabric link` first.')

    const rpc = getRpc({ apiUrl: ctx.apiUrl, token: ctx.token })
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
