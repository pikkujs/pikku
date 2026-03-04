import { z } from 'zod'
import { pikkuSessionlessFunc } from '#pikku'

export const ResetEmailsInput = z.object({})

export const ResetEmailsOutput = z.object({
  success: z.boolean(),
})

export const resetEmails = pikkuSessionlessFunc({
  description: 'Resets all emails to their initial seed data',
  expose: true,
  input: ResetEmailsInput,
  output: ResetEmailsOutput,
  func: async ({ emailStore }) => {
    emailStore.reset()
    return { success: true }
  },
})
