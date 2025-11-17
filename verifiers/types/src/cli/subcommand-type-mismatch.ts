/**
 * Type constraint: CLI subcommands must have proper type safety
 *
 * When using nested subcommands, each level must maintain type safety
 * for parameters and options.
 */

import {
  wireCLI,
  pikkuCLICommand,
  pikkuFunc,
} from '../../.pikku/pikku-types.gen.js'

// Valid: Subcommands with proper types
wireCLI({
  program: 'test-cli',
  commands: {
    user: {
      description: 'User management',
      subcommands: {
        create: pikkuCLICommand({
          parameters: '<username> <email>',
          func: pikkuFunc<
            { username: string; email: string; admin: boolean },
            { id: number }
          >({
            func: async ({}, {}, data) => ({ id: 123 }),
          }),
          description: 'Create user',
          options: {
            admin: {
              description: 'Admin user',
              short: 'a',
              default: false,
            },
          },
        }),
        delete: pikkuCLICommand({
          parameters: '<id>',
          func: pikkuFunc<{ id: number }, void>({
            func: async ({}, data) => {
              console.log(data.id)
            },
          }),
          description: 'Delete user',
        }),
      },
    },
  },
})

wireCLI({
  program: 'test-cli-2',
  commands: {
    user: {
      description: 'User management',
      subcommands: {
        create: pikkuCLICommand({
          // @ts-expect-error - Subcommand parameter mismatch
          parameters: '<username> <email>',
          func: pikkuFunc<{ username: string }, { id: number }>({
            func: async () => ({ id: 123 }),
          }),
          description: 'Create user',
        }),
      },
    },
  },
})

wireCLI({
  program: 'test-cli-3',
  commands: {
    user: {
      description: 'User management',
      subcommands: {
        list: pikkuCLICommand({
          func: pikkuFunc<{ limit: string }, void>({
            func: async () => {},
          }),
          description: 'List users',
          options: {
            limit: {
              description: 'Limit results',
              short: 'l',
              // @ts-expect-error - Subcommand option type mismatch
              default: 10,
            },
          },
        }),
      },
    },
  },
})

// Valid: Nested subcommands
wireCLI({
  program: 'test-cli-4',
  commands: {
    db: {
      description: 'Database operations',
      subcommands: {
        migrate: {
          description: 'Migration commands',
          subcommands: {
            up: pikkuCLICommand({
              func: pikkuFunc<{ steps: number }, void>({
                func: async () => {},
              }),
              description: 'Run migrations',
              options: {
                steps: {
                  description: 'Number of steps',
                  short: 's',
                  default: 1,
                },
              },
            }),
          },
        },
      },
    },
  },
})

// Valid: Command with both parameters and options in subcommand
wireCLI({
  program: 'test-cli-6',
  commands: {
    file: {
      description: 'File operations',
      subcommands: {
        copy: pikkuCLICommand({
          parameters: '<source> <dest>',
          func: pikkuFunc<
            {
              source: string
              dest: string
              force: boolean
              recursive: boolean
            },
            void
          >({
            func: async ({}, data) => {
              console.log(data.source, data.dest, data.force, data.recursive)
            },
          }),
          description: 'Copy files',
          options: {
            force: {
              description: 'Force overwrite',
              short: 'f',
              default: false,
            },
            recursive: {
              description: 'Copy recursively',
              short: 'r',
              default: false,
            },
          },
        }),
      },
    },
  },
})
