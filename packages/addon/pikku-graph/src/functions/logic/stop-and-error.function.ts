import { z } from 'zod'
import { pikkuSessionlessFunc } from '#pikku'

export const StopAndErrorInput = z.object({
  message: z
    .string()
    .describe('The error message to throw, halting the workflow'),
})

export const StopAndErrorOutput = z.void()

export const stopAndError = pikkuSessionlessFunc({
  description: 'Throw an error to stop the workflow',
  node: { displayName: 'Stop And Error', category: 'Logic', type: 'action' },
  input: StopAndErrorInput,
  output: StopAndErrorOutput,
  func: async (_services, data) => {
    throw new Error(data.message)
  },
})
