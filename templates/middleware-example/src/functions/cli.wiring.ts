import {
  wireCLI,
  pikkuCLICommand,
  addMiddleware,
  pikkuSessionlessFunc,
} from '../../.pikku/pikku-types.gen.js'
import { globalMiddleware } from '../middleware/global.js'
import { wireMiddleware } from '../middleware/wire.js'
import { functionMiddleware } from '../middleware/function.js'

// Tag middleware for CLI
export const cliTagMiddleware = () => addMiddleware('cli', [globalMiddleware])

const cliNoOpFunction = pikkuSessionlessFunc({
  func: async ({ logger }, _data) => {
    logger.info({ type: 'function', name: 'noOp', phase: 'execute' })
    return { success: true }
  },
  middleware: [functionMiddleware],
})

wireCLI({
  program: 'test-cli',
  tags: ['cli'],
  middleware: [wireMiddleware],
  commands: {
    greet: pikkuCLICommand({
      command: 'greet <name>',
      func: cliNoOpFunction,
      description: 'Greet a user by name',
      options: {
        loud: {
          description: 'Use loud greeting (uppercase)',
          short: 'l',
          default: false,
        },
      },
      render: (result) => {
        console.log(JSON.stringify(result))
      },
    }),
  },
})
