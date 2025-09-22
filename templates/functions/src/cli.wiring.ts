import { wireCLI, pikkuCLIOptions } from '../.pikku/pikku-types.gen.js'
import {
  greetUser,
  calculate,
  addNumbers,
  subtractNumbers,
  multiplyNumbers,
  divideNumbers,
  createUser,
  listUsers,
  processFile,
} from './cli.functions.js'
import {
  greetRenderer,
  calcRenderer,
  userRenderer,
  fileRenderer,
  jsonRenderer,
} from './cli.render.js'

// Wire the main CLI application
wireCLI({
  program: 'my-cli',
  commands: {
    // Simple greeting command
    greet: {
      command: 'greet <name>',
      func: greetUser,
      description: 'Greet a user by name',
      render: greetRenderer,
      options: pikkuCLIOptions<{ loud: boolean }>({
        loud: {
          description: 'Use loud greeting (uppercase)',
          short: 'l',
          default: false,
        },
      }),
    },

    // Math calculator commands
    calc: {
      description: 'Mathematical calculations',
      subcommands: {
        add: {
          command: 'add <a> <b>',
          func: addNumbers,
          description: 'Add two numbers',
          render: calcRenderer,
        },
        subtract: {
          command: 'subtract <a> <b>',
          func: subtractNumbers,
          description: 'Subtract two numbers',
          render: calcRenderer,
        },
        multiply: {
          command: 'multiply <a> <b>',
          func: multiplyNumbers,
          description: 'Multiply two numbers',
          render: calcRenderer,
        },
        divide: {
          command: 'divide <a> <b>',
          func: divideNumbers,
          description: 'Divide two numbers',
          render: calcRenderer,
        },
      },
    },

    // User management commands
    user: {
      description: 'User management commands',
      subcommands: {
        create: {
          command: 'create <username> <email>',
          func: createUser,
          description: 'Create a new user',
          render: userRenderer,
          options: pikkuCLIOptions<{ admin: boolean }>({
            admin: {
              description: 'Create user as admin',
              short: 'a',
              default: false,
            },
          }),
        },
        list: {
          command: 'list',
          func: listUsers,
          description: 'List all users',
          render: userRenderer,
          options: pikkuCLIOptions<{ limit: number; admin: boolean }>({
            limit: {
              description: 'Limit number of users shown',
              short: 'l',
            },
            admin: {
              description: 'Show only admin users',
              short: 'a',
              default: false,
            },
          }),
        },
      },
    },

    // File operations
    file: {
      command: 'file <path>',
      func: processFile,
      description: 'Process a file',
      render: fileRenderer,
      options: pikkuCLIOptions<{
        action: 'read' | 'info' | 'delete'
        backup: boolean
      }>({
        action: {
          description: 'Action to perform on file',
          short: 'a',
          default: 'info' as const,
          choices: ['read', 'info', 'delete'],
        },
        backup: {
          description: 'Create backup before processing',
          short: 'b',
          default: false,
        },
      }),
    },
  },

  // Global options for all commands
  options: pikkuCLIOptions<{ verbose: boolean; config: string }>({
    verbose: {
      description: 'Enable verbose output',
      short: 'v',
      default: false,
    },
    config: {
      description: 'Configuration file path',
      short: 'c',
      default: './config.json',
    },
  }),

  // Global renderer (fallback if command doesn't have specific renderer)
  render: jsonRenderer,
})
