/**
 * Type constraint: MCP tool input types must match function signatures
 *
 * MCP tools accept input parameters that must be properly typed.
 * Tools are defined using pikkuMCPToolFunc with description.
 */

import { pikkuMCPToolFunc } from '#pikku'

// Valid: Tool with properly typed input
export const greet = pikkuMCPToolFunc<{ name: string }>({
  description: 'Greet a user',
  func: async ({}, { name }, {}) => {
    return [{ type: 'text', text: `Hello, ${name}!` }]
  },
})

// Valid: Tool with optional parameters
export const greetOptional = pikkuMCPToolFunc<{
  name: string
  greeting?: string
}>({
  description: 'Greet a user with optional greeting',
  func: async ({}, data, {}) => {
    return [
      { type: 'text', text: `${data.greeting || 'Hello'}, ${data.name}!` },
    ]
  },
})

// Valid: Tool with complex input type
export const calculate = pikkuMCPToolFunc<{
  operation: 'add' | 'subtract' | 'multiply' | 'divide'
  a: number
  b: number
}>({
  description: 'Perform calculation',
  func: async ({}, { operation, a, b }, {}) => {
    const result = operation === 'add' ? a + b : a - b
    return [{ type: 'text', text: `Result: ${result}` }]
  },
})

export const invalidAccess = pikkuMCPToolFunc<{ name: string }>({
  description: 'Invalid property access',
  func: async ({}, data, {}) => {
    // @ts-expect-error - Accessing property that doesn't exist in input type
    return [{ type: 'text', text: `Age: ${data.age}` }]
  },
})

// Valid: Tool with no input parameters
export const timestamp = pikkuMCPToolFunc<unknown>({
  description: 'Get current timestamp',
  func: async () => {
    return [{ type: 'text', text: `Now: ${Date.now()}` }]
  },
})

export const invalidReturn = pikkuMCPToolFunc<{ name: string }>({
  description: 'Invalid return type',
  // @ts-expect-error - Return type must be array of content items
  func: async ({}, { name }, {}) => {
    return `Hello, ${name}!`
  },
})

export const invalidContent = pikkuMCPToolFunc<{ name: string }>({
  description: 'Invalid content format',
  // @ts-expect-error - Content items must have type and text properties
  func: async ({}, { name }, {}) => {
    return [{ message: `Hello, ${name}!` }]
  },
})

// Valid: Multiple content items
export const multiContent = pikkuMCPToolFunc<{ count: number }>({
  description: 'Return multiple content items',
  func: async ({}, { count }, {}) => {
    return Array.from({ length: count }, (_, i) => ({
      type: 'text',
      text: `Item ${i + 1}`,
    }))
  },
})
