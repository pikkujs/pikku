import { pikkuFuncSessionless } from '#pikku/pikku-types.gen.js'

/**
 * Calculator functions for CLI
 * Demonstrates multiple related functions with shared output type
 */

type CalcInput = {
  a: number // from positional <a>
  b: number // from positional <b>
}

type CalcOutput = {
  operation: string
  operands: number[]
  result: number
  expression: string
}

export const addNumbers = pikkuFuncSessionless<CalcInput, CalcOutput>({
  docs: {
    summary: 'Add two numbers',
    tags: ['cli', 'calculator'],
    errors: [],
  },
  func: async (_services, data) => {
    const result = data.a + data.b
    return {
      operation: 'add',
      operands: [data.a, data.b],
      result,
      expression: `${data.a} + ${data.b} = ${result}`,
    }
  },
})

export const subtractNumbers = pikkuFuncSessionless<CalcInput, CalcOutput>({
  docs: {
    summary: 'Subtract two numbers',
    tags: ['cli', 'calculator'],
    errors: [],
  },
  func: async (_services, data) => {
    const result = data.a - data.b
    return {
      operation: 'subtract',
      operands: [data.a, data.b],
      result,
      expression: `${data.a} - ${data.b} = ${result}`,
    }
  },
})
