import { z } from 'zod'
import { pikkuSessionlessFunc } from '#pikku'

export const ConcatInput = z.object({
  inputs: z
    .array(z.unknown())
    .describe(
      'The input streams to concatenate; each array is flattened one level, each non-array counts as a single item'
    ),
})

export const ConcatOutput = z.object({
  items: z
    .array(z.unknown())
    .describe('All input items concatenated in input order'),
})

type Output = z.infer<typeof ConcatOutput>

export const concat = pikkuSessionlessFunc({
  description: 'Concatenate multiple input streams into one list',
  node: { displayName: 'Concat', category: 'Transform', type: 'action' },
  input: ConcatInput,
  output: ConcatOutput,
  func: async (_services, data) => ({
    items: data.inputs.flatMap((v) => (Array.isArray(v) ? v : [v])),
  }),
})
