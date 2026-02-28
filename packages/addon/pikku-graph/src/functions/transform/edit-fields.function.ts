import { z } from 'zod'
import { pikkuSessionlessFunc } from '#pikku'

const FieldOperationSchema = z.object({
  field: z
    .string()
    .describe('The field path to operate on (supports dot notation)'),
  operation: z
    .enum(['set', 'remove', 'rename'])
    .describe('The operation to perform'),
  value: z
    .unknown()
    .optional()
    .describe('The value to set (for set operation)'),
  newName: z
    .string()
    .optional()
    .describe('The new field name (for rename operation)'),
})

export const EditFieldsInput = z.object({
  item: z
    .record(z.string(), z.unknown())
    .describe('The input object to transform'),
  operations: z
    .array(FieldOperationSchema)
    .describe('List of field operations to perform'),
})

export const EditFieldsOutput = z.object({
  item: z.record(z.string(), z.unknown()).describe('The transformed object'),
})

type Output = z.infer<typeof EditFieldsOutput>

const setNestedValue = (
  obj: Record<string, unknown>,
  path: string,
  value: unknown
): void => {
  const keys = path.split('.')
  let current = obj
  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i]
    if (
      !(key in current) ||
      typeof current[key] !== 'object' ||
      current[key] === null
    ) {
      current[key] = {}
    }
    current = current[key] as Record<string, unknown>
  }
  current[keys[keys.length - 1]] = value
}

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
): void => {
  const keys = path.split('.')
  let current = obj
  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i]
    if (
      !(key in current) ||
      typeof current[key] !== 'object' ||
      current[key] === null
    ) {
      return
    }
    current = current[key] as Record<string, unknown>
  }
  delete current[keys[keys.length - 1]]
}

export const editFields = pikkuSessionlessFunc({
  description: 'Modify, add, or remove item fields',
  node: { displayName: 'Edit Fields', category: 'Transform', type: 'action' },
  input: EditFieldsInput,
  output: EditFieldsOutput,
  func: async (_services, data) => {
    const result = { ...data.item }

    for (const op of data.operations) {
      switch (op.operation) {
        case 'set':
          setNestedValue(result, op.field, op.value)
          break
        case 'remove':
          deleteNestedValue(result, op.field)
          break
        case 'rename':
          if (op.newName) {
            const value = getNestedValue(result, op.field)
            deleteNestedValue(result, op.field)
            setNestedValue(result, op.newName, value)
          }
          break
      }
    }

    return { item: result }
  },
})
