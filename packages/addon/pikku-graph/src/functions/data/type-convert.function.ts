import { z } from 'zod'
import { pikkuSessionlessFunc } from '#pikku'

export const TypeConvertInput = z.object({
  value: z.unknown().describe('The value to convert'),
  to: z
    .enum(['string', 'number', 'boolean', 'json', 'array'])
    .describe('Target type'),
  radix: z
    .number()
    .optional()
    .describe('Radix for number parsing (e.g., 10, 16)'),
})

export const TypeConvertOutput = z.object({
  result: z.unknown().describe('The converted value'),
  success: z.boolean().describe('Whether the conversion succeeded'),
  originalType: z.string().describe('The original type of the value'),
})

type Output = z.infer<typeof TypeConvertOutput>

export const typeConvert = pikkuSessionlessFunc({
  description: 'Convert between types (string, number, boolean, json, array)',
  node: { displayName: 'Type Convert', category: 'Data', type: 'action' },
  input: TypeConvertInput,
  output: TypeConvertOutput,
  func: async (_services, data) => {
    const originalType = Array.isArray(data.value) ? 'array' : typeof data.value
    let result: unknown
    let success = true

    try {
      switch (data.to) {
        case 'string':
          if (typeof data.value === 'object') {
            result = JSON.stringify(data.value)
          } else {
            result = String(data.value)
          }
          break

        case 'number':
          if (typeof data.value === 'string') {
            result = data.radix
              ? parseInt(data.value, data.radix)
              : parseFloat(data.value)
          } else if (typeof data.value === 'boolean') {
            result = data.value ? 1 : 0
          } else {
            result = Number(data.value)
          }
          if (isNaN(result as number)) {
            result = 0
            success = false
          }
          break

        case 'boolean':
          if (typeof data.value === 'string') {
            const lower = data.value.toLowerCase()
            result = lower === 'true' || lower === '1' || lower === 'yes'
          } else if (typeof data.value === 'number') {
            result = data.value !== 0
          } else {
            result = Boolean(data.value)
          }
          break

        case 'json':
          if (typeof data.value === 'string') {
            result = JSON.parse(data.value)
          } else {
            result = data.value
          }
          break

        case 'array':
          if (Array.isArray(data.value)) {
            result = data.value
          } else if (typeof data.value === 'string') {
            try {
              const parsed = JSON.parse(data.value)
              result = Array.isArray(parsed) ? parsed : [parsed]
            } catch {
              result = [data.value]
            }
          } else {
            result = [data.value]
          }
          break

        default:
          result = data.value
      }
    } catch {
      result = null
      success = false
    }

    return { result, success, originalType }
  },
})
