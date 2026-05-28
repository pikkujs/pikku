/**
 * Type constraint: CLI command options must match function input types
 *
 * When a CLI command specifies options, the function's input type
 * must include those options with compatible types.
 */

import { wireCLI, pikkuCLICommand, pikkuSessionlessFunc } from '#pikku'

// Valid: Options match function input type
wireCLI({
  program: 'test-cli',
  commands: {
    greet: pikkuCLICommand({
      parameters: '<name>',
      func: pikkuSessionlessFunc<{ name: string; loud: boolean }, void>({
        func: async ({}, data) => {
          console.log(data.name, data.loud)
        },
      }),
      description: 'Greet a user',
      options: {
        loud: {
          description: 'Loud greeting',
          short: 'l',
          default: false,
        },
      },
    }),
  },
})

wireCLI({
  program: 'test-cli-2',
  commands: {
    greet: pikkuCLICommand({
      parameters: '<name>',
      func: pikkuSessionlessFunc<{ name: string }, void>({
        func: async () => {},
      }),
      description: 'Greet a user',
      options: {
        // @ts-expect-error - Option 'loud' defined but not in function input type
        loud: {
          description: 'Loud greeting',
          short: 'l',
          default: false,
        },
      },
    }),
  },
})

wireCLI({
  program: 'test-cli-3',
  commands: {
    greet: pikkuCLICommand({
      parameters: '<name>',
      func: pikkuSessionlessFunc<{ name: string; loud: string }, void>({
        func: async () => {},
      }),
      description: 'Greet a user',
      options: {
        loud: {
          description: 'Loud greeting',
          short: 'l',
          // @ts-expect-error - Option type mismatch (default is boolean but function expects string)
          default: false,
        },
      },
    }),
  },
})

// Valid: Multiple options with different types
wireCLI({
  program: 'test-cli-4',
  commands: {
    process: pikkuCLICommand({
      parameters: '<file>',
      func: pikkuSessionlessFunc<
        {
          file: string
          verbose: boolean
          limit: number
          format: string
        },
        void
      >({
        func: async () => {},
      }),
      description: 'Process a file',
      options: {
        verbose: {
          description: 'Verbose output',
          short: 'v',
          default: false,
        },
        limit: {
          description: 'Limit results',
          short: 'l',
          default: 10,
        },
        format: {
          description: 'Output format',
          short: 'f',
          default: 'json',
        },
      },
    }),
  },
})

wireCLI({
  program: 'test-cli-5',
  commands: {
    process: pikkuCLICommand({
      parameters: '<file>',
      func: pikkuSessionlessFunc<
        {
          file: string
          verbose: boolean
        },
        void
      >({
        func: async () => {},
      }),
      description: 'Process a file',
      options: {
        verbose: {
          description: 'Verbose output',
          short: 'v',
          default: false,
        },
        // @ts-expect-error - Missing option in function type
        limit: {
          description: 'Limit results',
          short: 'l',
          default: 10,
        },
      },
    }),
  },
})

// Valid: Optional option (no default provided)
wireCLI({
  program: 'test-cli-6',
  commands: {
    search: pikkuCLICommand({
      parameters: '<query>',
      func: pikkuSessionlessFunc<{ query: string; limit?: number }, void>({
        func: async () => {},
      }),
      description: 'Search',
      options: {
        limit: {
          description: 'Limit results',
          short: 'l',
        },
      },
    }),
  },
})
