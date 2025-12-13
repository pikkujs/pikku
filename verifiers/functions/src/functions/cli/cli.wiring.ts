import { wireCLI, pikkuCLICommand } from '#pikku'
import {
  greetUser,
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
    // Simple greeting command with automatic option inference
    greet: pikkuCLICommand({
      parameters: '<name>',
      func: greetUser,
      description: 'Greet a user by name',
      render: greetRenderer,
      options: {
        loud: {
          description: 'Use loud greeting (uppercase)',
          short: 'l',
          default: false,
        },
      },
    }),

    // Math calculator commands
    calc: {
      description: 'Mathematical calculations',
      subcommands: {
        add: pikkuCLICommand({
          parameters: '<a> <b>',
          func: addNumbers,
          description: 'Add two numbers',
          render: calcRenderer,
        }),
        subtract: pikkuCLICommand({
          parameters: '<a> <b>',
          func: subtractNumbers,
          description: 'Subtract two numbers',
          render: calcRenderer,
        }),
        multiply: pikkuCLICommand({
          parameters: '<a> <b>',
          func: multiplyNumbers,
          description: 'Multiply two numbers',
          render: calcRenderer,
        }),
        divide: pikkuCLICommand({
          parameters: '<a> <b>',
          func: divideNumbers,
          description: 'Divide two numbers',
          render: calcRenderer,
        }),
      },
    },

    // User management commands
    user: {
      description: 'User management commands',
      subcommands: {
        create: pikkuCLICommand({
          parameters: '<username> <email>',
          func: createUser,
          description: 'Create a new user',
          render: userRenderer,
          options: {
            admin: {
              description: 'Create user as admin',
              short: 'a',
              default: false,
            },
          },
        }),
        list: pikkuCLICommand({
          func: listUsers,
          description: 'List all users',
          render: userRenderer,
          options: {
            limit: {
              description: 'Limit number of users shown',
              short: 'l',
            },
            admin: {
              description: 'Show only admin users',
              short: 'a',
              default: false,
            },
          },
        }),
      },
    },

    // File operations with automatic enum detection
    file: pikkuCLICommand({
      parameters: '<path>',
      func: processFile,
      description: 'Process a file',
      render: fileRenderer,
      options: {
        action: {
          description: 'Action to perform on file',
          short: 'a',
          default: 'info' as const,
        },
        backup: {
          description: 'Create backup before processing',
          short: 'b',
          default: false,
        },
      },
    }),
  },

  // Global options for all commands
  options: {
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
  },

  // Global renderer (fallback if command doesn't have specific renderer)
  render: jsonRenderer,
})
