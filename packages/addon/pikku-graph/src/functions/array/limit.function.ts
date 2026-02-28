import { z } from 'zod'
import { pikkuSessionlessFunc } from '#pikku'

export const LimitInput = z.object({
  items: z.array(z.unknown()).describe('The array of items to limit'),
  limit: z.number().min(0).describe('Maximum number of items to return'),
  offset: z
    .number()
    .min(0)
    .optional()
    .describe('Number of items to skip from the beginning'),
})

export const LimitOutput = z.object({
  items: z.array(z.unknown()).describe('The limited array of items'),
  totalCount: z.number().describe('The original total count before limiting'),
})

type Output = z.infer<typeof LimitOutput>

export const limit = pikkuSessionlessFunc({
  description: 'Restrict the number of items',
  node: { displayName: 'Limit', category: 'Array', type: 'action' },
  input: LimitInput,
  output: LimitOutput,
  func: async (_services, data) => {
    const offset = data.offset ?? 0
    const totalCount = data.items.length
    const items = data.items.slice(offset, offset + data.limit)
    return { items, totalCount }
  },
})
