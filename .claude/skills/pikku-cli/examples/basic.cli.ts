import { wireCLI, pikkuCLICommand } from './pikku-types.gen.js'
import { greetUser } from './functions/greet.function.js'
import { greetRenderer } from './greet.render.js'

/**
 * Basic CLI wiring
 * Single command with positional parameter and options
 */

wireCLI({
  program: 'greet-tool',
  description: 'A simple greeting CLI tool',
  commands: {
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
  },
})

// Usage:
// greet-tool greet Alice
// greet-tool greet Alice --loud
// greet-tool greet Alice -l
