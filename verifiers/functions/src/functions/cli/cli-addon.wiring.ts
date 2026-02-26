import { wireCLI, pikkuCLICommand, defineCLICommands } from '#pikku'
import {
  greetUser,
  addNumbers,
  subtractNumbers,
  multiplyNumbers,
  divideNumbers,
} from './cli.functions.js'
import { greetRenderer, calcRenderer, jsonRenderer } from './cli.render.js'

// Define commands externally using defineCLICommands
export const mathCommands = defineCLICommands({
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
})

// Wire a CLI that spreads externally-defined commands alongside inline commands
wireCLI({
  program: 'external-cli',
  commands: {
    // Spread externally-defined commands
    ...mathCommands,
    // Inline command alongside the spread
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
  render: jsonRenderer,
})
