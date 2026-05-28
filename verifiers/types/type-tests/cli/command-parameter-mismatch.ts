/**
 * Type constraint: CLI command parameters must match function input types
 *
 * When a CLI command specifies parameters (e.g., '<name> <age>'),
 * the function's input type must include those parameters.
 */

import { wireCLI, pikkuCLICommand, pikkuSessionlessFunc } from '#pikku'

// Valid: Parameters match function input type
wireCLI({
  program: 'test-cli',
  commands: {
    greet: pikkuCLICommand({
      parameters: '<name>',
      func: pikkuSessionlessFunc<{ name: string }, void>({
        func: async ({}, data) => {
          console.log(data.name)
        },
      }),
      description: 'Greet a user',
    }),
  },
})

wireCLI({
  program: 'test-cli-2',
  commands: {
    greet: pikkuCLICommand({
      // @ts-expect-error - Parameters specify '<name>' but function input type is empty
      parameters: '<name>',
      func: pikkuSessionlessFunc<{}, void>({
        func: async () => {},
      }),
      description: 'Greet a user',
    }),
  },
})

wireCLI({
  program: 'test-cli-3',
  commands: {
    greet: pikkuCLICommand({
      // @ts-expect-error - Parameters specify '<name> <age>' but function only has 'name'
      parameters: '<name> <age>',
      func: pikkuSessionlessFunc<{ name: string }, void>({
        func: async () => {},
      }),
      description: 'Greet a user',
    }),
  },
})

// Valid: Multiple parameters
wireCLI({
  program: 'test-cli-4',
  commands: {
    add: pikkuCLICommand({
      parameters: '<a> <b>',
      func: pikkuSessionlessFunc<{ a: number; b: number }, { result: number }>({
        func: async ({}, data) => ({ result: data.a + data.b }),
      }),
      description: 'Add two numbers',
    }),
  },
})

wireCLI({
  program: 'test-cli-5',
  commands: {
    add: pikkuCLICommand({
      // @ts-expect-error - Parameter name mismatch
      parameters: '<a> <b>',
      func: pikkuSessionlessFunc<{ x: number; y: number }, { result: number }>({
        func: async ({}, data) => ({ result: data.x + data.y }),
      }),
      description: 'Add two numbers',
    }),
  },
})

// Valid: Optional parameters with [brackets]
wireCLI({
  program: 'test-cli-6',
  commands: {
    greet: pikkuCLICommand({
      parameters: '<name> [greeting]',
      func: pikkuSessionlessFunc<{ name: string; greeting?: string }, void>({
        func: async () => {},
      }),
      description: 'Greet a user',
    }),
  },
})
