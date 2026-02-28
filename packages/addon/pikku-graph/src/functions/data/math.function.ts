import { z } from 'zod'
import { pikkuSessionlessFunc } from '#pikku'

export const MathInput = z.object({
  operation: z
    .enum([
      'add',
      'subtract',
      'multiply',
      'divide',
      'modulo',
      'power',
      'sqrt',
      'abs',
      'round',
      'floor',
      'ceil',
      'min',
      'max',
      'random',
    ])
    .describe('The math operation to perform'),
  a: z.number().optional().describe('First operand'),
  b: z.number().optional().describe('Second operand (for binary operations)'),
  decimals: z
    .number()
    .optional()
    .describe('Decimal places for round operation'),
})

export const MathOutput = z.object({
  result: z.number().describe('The result of the operation'),
})

type Output = z.infer<typeof MathOutput>

export const math = pikkuSessionlessFunc({
  description: 'Perform math operations',
  node: { displayName: 'Math', category: 'Data', type: 'action' },
  input: MathInput,
  output: MathOutput,
  func: async (_services, data) => {
    const a = data.a ?? 0
    const b = data.b ?? 0
    let result: number

    switch (data.operation) {
      case 'add':
        result = a + b
        break
      case 'subtract':
        result = a - b
        break
      case 'multiply':
        result = a * b
        break
      case 'divide':
        result = b !== 0 ? a / b : 0
        break
      case 'modulo':
        result = a % b
        break
      case 'power':
        result = Math.pow(a, b)
        break
      case 'sqrt':
        result = Math.sqrt(a)
        break
      case 'abs':
        result = Math.abs(a)
        break
      case 'round':
        const factor = Math.pow(10, data.decimals ?? 0)
        result = Math.round(a * factor) / factor
        break
      case 'floor':
        result = Math.floor(a)
        break
      case 'ceil':
        result = Math.ceil(a)
        break
      case 'min':
        result = Math.min(a, b)
        break
      case 'max':
        result = Math.max(a, b)
        break
      case 'random':
        result = Math.random() * (b - a) + a
        break
      default:
        result = 0
    }

    return { result }
  },
})
