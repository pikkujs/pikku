import { wireCLI, pikkuCLICommand } from './pikku-types.gen.js'
import { addNumbers, subtractNumbers } from './functions/calculator.function.js'
import { calcRenderer, jsonRenderer } from './greet.render.js'

/**
 * Nested commands (subcommands)
 * Demonstrates hierarchical CLI structure
 */

wireCLI({
  program: 'calc-tool',
  description: 'Mathematical calculator CLI',

  // Global renderer (fallback)
  render: jsonRenderer,

  // Global options (inherited by all commands)
  options: {
    verbose: {
      description: 'Enable verbose output',
      short: 'v',
      default: false,
    },
  },

  commands: {
    // Command group with subcommands
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
      },
    },
  },
})

// Usage:
// calc-tool calc add 5 3
// calc-tool calc subtract 10 4
// calc-tool calc add 5 3 --verbose
