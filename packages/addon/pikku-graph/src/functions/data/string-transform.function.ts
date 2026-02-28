import { z } from 'zod'
import { pikkuSessionlessFunc } from '#pikku'

export const StringTransformInput = z.object({
  value: z.string().describe('The input string'),
  operation: z
    .enum([
      'uppercase',
      'lowercase',
      'capitalize',
      'camelCase',
      'snakeCase',
      'kebabCase',
      'trim',
      'trimStart',
      'trimEnd',
      'split',
      'replace',
      'slice',
      'padStart',
      'padEnd',
    ])
    .describe('The transformation to apply'),
  separator: z.string().optional().describe('Separator for split operation'),
  search: z.string().optional().describe('Search string for replace operation'),
  replacement: z
    .string()
    .optional()
    .describe('Replacement string for replace operation'),
  replaceAll: z.boolean().optional().describe('Replace all occurrences'),
  start: z.number().optional().describe('Start index for slice'),
  end: z.number().optional().describe('End index for slice'),
  length: z.number().optional().describe('Target length for pad operations'),
  padChar: z.string().optional().describe('Character to pad with'),
})

export const StringTransformOutput = z.object({
  result: z
    .union([z.string(), z.array(z.string())])
    .describe('The transformed result'),
})

type Output = z.infer<typeof StringTransformOutput>

const toCamelCase = (str: string): string => {
  return str
    .replace(/[-_\s]+(.)?/g, (_, c) => (c ? c.toUpperCase() : ''))
    .replace(/^./, (c) => c.toLowerCase())
}

const toSnakeCase = (str: string): string => {
  return str
    .replace(/([A-Z])/g, '_$1')
    .replace(/[-\s]+/g, '_')
    .toLowerCase()
    .replace(/^_/, '')
}

const toKebabCase = (str: string): string => {
  return str
    .replace(/([A-Z])/g, '-$1')
    .replace(/[_\s]+/g, '-')
    .toLowerCase()
    .replace(/^-/, '')
}

const capitalize = (str: string): string => {
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase()
}

export const stringTransform = pikkuSessionlessFunc({
  description: 'Transform strings (case, trim, split, replace, etc.)',
  node: { displayName: 'String Transform', category: 'Data', type: 'action' },
  input: StringTransformInput,
  output: StringTransformOutput,
  func: async (_services, data) => {
    let result: string | string[]

    switch (data.operation) {
      case 'uppercase':
        result = data.value.toUpperCase()
        break
      case 'lowercase':
        result = data.value.toLowerCase()
        break
      case 'capitalize':
        result = capitalize(data.value)
        break
      case 'camelCase':
        result = toCamelCase(data.value)
        break
      case 'snakeCase':
        result = toSnakeCase(data.value)
        break
      case 'kebabCase':
        result = toKebabCase(data.value)
        break
      case 'trim':
        result = data.value.trim()
        break
      case 'trimStart':
        result = data.value.trimStart()
        break
      case 'trimEnd':
        result = data.value.trimEnd()
        break
      case 'split':
        result = data.value.split(data.separator ?? ',')
        break
      case 'replace':
        if (data.replaceAll) {
          result = data.value.replaceAll(
            data.search ?? '',
            data.replacement ?? ''
          )
        } else {
          result = data.value.replace(data.search ?? '', data.replacement ?? '')
        }
        break
      case 'slice':
        result = data.value.slice(data.start ?? 0, data.end)
        break
      case 'padStart':
        result = data.value.padStart(
          data.length ?? data.value.length,
          data.padChar ?? ' '
        )
        break
      case 'padEnd':
        result = data.value.padEnd(
          data.length ?? data.value.length,
          data.padChar ?? ' '
        )
        break
      default:
        result = data.value
    }

    return { result }
  },
})
