import { z } from 'zod'
import { pikkuSessionlessFunc } from '../../../.pikku/function/index.js'
import { resolveApiContext } from '../lib/config.js'
import { flushSpool } from '../lib/finding-spool.js'

export const FabricFindingsFlushInput = z.object({
  apiUrl: z.string().optional(),
})

export const FabricFindingsFlushOutput = z.object({
  sent: z.number(),
  remaining: z.number(),
  reason: z.string().optional(),
})

/**
 * Explicitly asked for, so unlike `report` this one says plainly that it
 * cannot run: someone who typed `flush` wants to know the login is missing,
 * not to have the queue quietly stay put.
 */
export const FabricFindingsFlush = pikkuSessionlessFunc({
  description: 'Send every finding queued locally.',
  input: FabricFindingsFlushInput,
  output: FabricFindingsFlushOutput,
  func: async (_services, { apiUrl: apiUrlOverride }) => {
    const ctx = await resolveApiContext({ apiUrlOverride })
    if (!ctx.token)
      throw new Error('Not logged in. Run `pikku fabric login` first.')

    const result = await flushSpool({
      apiUrl: ctx.apiUrl,
      token: ctx.token,
      projectId: ctx.projectId,
    })
    console.log(
      result.remaining === 0
        ? `[fabric] sent ${result.sent} finding(s)`
        : `[fabric] sent ${result.sent}, ${result.remaining} still queued (${result.reason})`
    )
    return result
  },
})
