import { z } from 'zod'
import { pikkuSessionlessFunc } from '#pikku'

export const OmitInput = z.object({
  item: z.record(z.string(), z.unknown()).describe('The input object'),
  fields: z.array(z.string()).describe('Fields to remove'),
})

export const OmitOutput = z.object({
  item: z
    .record(z.string(), z.unknown())
    .describe('Object without the specified fields'),
})

type Output = z.infer<typeof OmitOutput>

export const omit = pikkuSessionlessFunc({
  description: 'Remove specified fields from an object',
  node: { displayName: 'Omit', category: 'Transform', type: 'action' },
  input: OmitInput,
  output: OmitOutput,
  func: async (_services, data) => {
    const fieldsSet = new Set(data.fields)
    const result: Record<string, unknown> = {}

    for (const [key, value] of Object.entries(data.item)) {
      if (!fieldsSet.has(key)) {
        result[key] = value
      }
    }

    return { item: result }
  },
})
