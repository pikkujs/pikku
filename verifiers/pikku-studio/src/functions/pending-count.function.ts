import { z } from 'zod'
import { pikkuSessionlessFunc } from '../../.pikku/addon/function/index.js'

export const PendingCountInput = z.object({})
export const PendingCountOutput = z.object({ count: z.number() })

/** The count the inbox screen's nav badge shows. */
export const pendingCount = pikkuSessionlessFunc({
  description: 'Counts the pending items the inbox nav badge shows',
  input: PendingCountInput,
  output: PendingCountOutput,
  func: async () => ({ count: 3 }),
})
