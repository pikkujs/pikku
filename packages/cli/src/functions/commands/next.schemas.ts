import { z } from 'zod'

export const NextInput = z.object({})

export const NextOutput = z.object({
  agent: z.enum(['changes']).nullable(),
  skill: z.string().nullable(),
  refs: z.array(z.string()),
  reason: z.string(),
  context: z.string().nullable(),
})
