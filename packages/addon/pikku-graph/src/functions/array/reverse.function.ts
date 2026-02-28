import { z } from 'zod'
import { pikkuSessionlessFunc } from '#pikku'

export const ReverseInput = z.object({
  items: z.array(z.unknown()).describe('The array to reverse'),
})

export const ReverseOutput = z.object({
  items: z.array(z.unknown()).describe('The reversed array'),
})

type Output = z.infer<typeof ReverseOutput>

export const reverse = pikkuSessionlessFunc({
  description: 'Reverse the order of items in an array',
  node: { displayName: 'Reverse', category: 'Array', type: 'action' },
  input: ReverseInput,
  output: ReverseOutput,
  func: async (_services, data) => {
    return { items: [...data.items].reverse() }
  },
})
