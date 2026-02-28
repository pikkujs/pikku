import { z } from 'zod'
import { pikkuSessionlessFunc } from '#pikku'

export const SplitOutInput = z.object({
  item: z
    .record(z.string(), z.unknown())
    .describe('The input object containing a nested array'),
  field: z
    .string()
    .describe(
      'The field path containing the array to split (supports dot notation)'
    ),
  includeParent: z
    .boolean()
    .optional()
    .describe('Include parent object fields in each output item'),
})

export const SplitOutOutput = z.object({
  items: z
    .array(z.record(z.string(), z.unknown()))
    .describe('The split array of items'),
})

type Output = z.infer<typeof SplitOutOutput>

const getNestedValue = (
  obj: Record<string, unknown>,
  path: string
): unknown => {
  const keys = path.split('.')
  let current: unknown = obj
  for (const key of keys) {
    if (current === null || typeof current !== 'object') return undefined
    current = (current as Record<string, unknown>)[key]
  }
  return current
}

const deleteNestedValue = (
  obj: Record<string, unknown>,
  path: string
): Record<string, unknown> => {
  const result = JSON.parse(JSON.stringify(obj))
  const keys = path.split('.')
  let current = result
  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i]
    if (
      !(key in current) ||
      typeof current[key] !== 'object' ||
      current[key] === null
    ) {
      return result
    }
    current = current[key] as Record<string, unknown>
  }
  delete current[keys[keys.length - 1]]
  return result
}

export const splitOut = pikkuSessionlessFunc({
  description: 'Turn a list inside item(s) into separate items',
  node: { displayName: 'Split Out', category: 'Array', type: 'action' },
  input: SplitOutInput,
  output: SplitOutOutput,
  func: async (_services, data) => {
    const includeParent = data.includeParent ?? true
    const arrayValue = getNestedValue(data.item, data.field)

    if (!Array.isArray(arrayValue)) {
      return { items: [data.item] }
    }

    const parentWithoutArray = includeParent
      ? deleteNestedValue(data.item, data.field)
      : {}

    const items = arrayValue.map((element) => {
      if (
        typeof element === 'object' &&
        element !== null &&
        !Array.isArray(element)
      ) {
        return {
          ...parentWithoutArray,
          ...(element as Record<string, unknown>),
        }
      }
      return { ...parentWithoutArray, value: element }
    })

    return { items }
  },
})
