import { z } from 'zod'
import { pikkuSessionlessFunc } from '#pikku'

export const ChunkInput = z.object({
  items: z.array(z.unknown()).describe('The array to split into chunks'),
  size: z.number().min(1).describe('Size of each chunk'),
})

export const ChunkOutput = z.object({
  chunks: z.array(z.array(z.unknown())).describe('Array of chunks'),
})

type Output = z.infer<typeof ChunkOutput>

export const chunk = pikkuSessionlessFunc({
  description: 'Split array into chunks of specified size',
  node: { displayName: 'Chunk', category: 'Array', type: 'action' },
  input: ChunkInput,
  output: ChunkOutput,
  func: async (_services, data) => {
    const chunks: unknown[][] = []

    for (let i = 0; i < data.items.length; i += data.size) {
      chunks.push(data.items.slice(i, i + data.size))
    }

    return { chunks }
  },
})
