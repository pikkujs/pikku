import { z } from 'zod'

export const NextInput = z.object({
  prompt: z.string().optional(),
  exec: z.enum(['pi', 'claude']).optional(),
  harnessArg: z.array(z.string()).optional(),
  loop: z.boolean().optional(),
})

export const NextOutput = z.object({
  agent: z.enum(['changes', 'intake']).nullable(),
  skill: z.string().nullable(),
  refs: z.array(z.string()),
  reason: z.string(),
  context: z.string().nullable(),
})
