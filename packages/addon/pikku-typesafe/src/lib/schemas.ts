import { z } from 'zod'

export const NoulQuestion = z.object({
  type: z.literal('noul'),
  instructions: z.string(),
  criteria: z.object({ true: z.string(), false: z.string() }).optional(),
})

export const ChoiceQuestion = z.object({
  type: z.literal('choice'),
  instructions: z.string(),
  criteria: z.record(z.string(), z.string().nullable()),
})

export const Question = z.discriminatedUnion('type', [
  NoulQuestion,
  ChoiceQuestion,
])

export const Answer = z.union([
  z.object({ type: z.literal('noul'), noul: z.number() }),
  z.object({
    type: z.literal('choice'),
    choice: z.string(),
    probabilities: z.record(z.string(), z.number()),
    confidence: z.number(),
  }),
])
