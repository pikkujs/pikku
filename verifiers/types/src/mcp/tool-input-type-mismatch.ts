/**
 * Type constraint: MCP tool input types must match function signatures
 *
 * MCP tools accept input parameters that must be properly typed.
 */

import { wireMCPTool, pikkuMCPToolFunc } from '../../.pikku/pikku-types.gen.js'

// Valid: Tool with properly typed input
wireMCPTool({
  name: 'greet',
  description: 'Greet a user',
  func: pikkuMCPToolFunc<{ name: string }>(async ({}, { name }) => {
    return [{ type: 'text', text: `Hello, ${name}!` }]
  }),
})

// Valid: Tool with optional parameters
wireMCPTool({
  name: 'greetOptional',
  description: 'Greet a user with optional greeting',
  func: pikkuMCPToolFunc<{ name: string; greeting?: string }>(
    async ({}, data) => {
      return [
        { type: 'text', text: `${data.greeting || 'Hello'}, ${data.name}!` },
      ]
    }
  ),
})

// Valid: Tool with complex input type
wireMCPTool({
  name: 'calculate',
  description: 'Perform calculation',
  func: pikkuMCPToolFunc<{
    operation: 'add' | 'subtract' | 'multiply' | 'divide'
    a: number
    b: number
  }>(async ({}, { operation, a, b }) => {
    const result = operation === 'add' ? a + b : a - b
    return [{ type: 'text', text: `Result: ${result}` }]
  }),
})

wireMCPTool({
  name: 'invalidAccess',
  description: 'Invalid property access',
  func: pikkuMCPToolFunc<{ name: string }>(async ({}, data) => {
    // @ts-expect-error - Accessing property that doesn't exist in input type
    return [{ type: 'text', text: `Age: ${data.age}` }]
  }),
})

// Valid: Tool with no input parameters
wireMCPTool({
  name: 'timestamp',
  description: 'Get current timestamp',
  func: pikkuMCPToolFunc<unknown>(async () => {
    return [{ type: 'text', text: `Now: ${Date.now()}` }]
  }),
})

wireMCPTool({
  name: 'invalidReturn',
  description: 'Invalid return type',
  // @ts-expect-error - Return type must be array of content items
  func: pikkuMCPToolFunc<{ name: string }>(async ({}, { name }) => {
    return `Hello, ${name}!`
  }),
})

wireMCPTool({
  name: 'invalidContent',
  description: 'Invalid content format',
  // @ts-expect-error - Content items must have type and text properties
  func: pikkuMCPToolFunc<{ name: string }>(async ({}, { name }) => {
    return [{ message: `Hello, ${name}!` }]
  }),
})

// Valid: Multiple content items
wireMCPTool({
  name: 'multiContent',
  description: 'Return multiple content items',
  func: pikkuMCPToolFunc<{ count: number }>(async ({}, { count }) => {
    return Array.from({ length: count }, (_, i) => ({
      type: 'text',
      text: `Item ${i + 1}`,
    }))
  }),
})
