import { z } from 'zod'
import { pikkuSessionlessFunc } from '#pikku'

const KeyMappingSchema = z.object({
  oldKey: z.string().describe('The original key name'),
  newKey: z.string().describe('The new key name'),
})

export const RenameKeysInput = z.object({
  item: z
    .record(z.string(), z.unknown())
    .describe('The input object to transform'),
  mappings: z.array(KeyMappingSchema).describe('List of key rename mappings'),
  keepUnmapped: z
    .boolean()
    .optional()
    .describe('Whether to keep keys that are not in the mapping'),
})

export const RenameKeysOutput = z.object({
  item: z
    .record(z.string(), z.unknown())
    .describe('The transformed object with renamed keys'),
})

type Output = z.infer<typeof RenameKeysOutput>

export const renameKeys = pikkuSessionlessFunc({
  description: 'Update item field names',
  node: { displayName: 'Rename Keys', category: 'Transform', type: 'action' },
  input: RenameKeysInput,
  output: RenameKeysOutput,
  func: async (_services, data) => {
    const keepUnmapped = data.keepUnmapped ?? true
    const mappingLookup = new Map(
      data.mappings.map((m) => [m.oldKey, m.newKey])
    )
    const result: Record<string, unknown> = {}

    for (const [key, value] of Object.entries(data.item)) {
      if (mappingLookup.has(key)) {
        result[mappingLookup.get(key)!] = value
      } else if (keepUnmapped) {
        result[key] = value
      }
    }

    return { item: result }
  },
})
