import {
  wireCLI,
  pikkuCLICommand,
  addMiddleware,
} from '../../.pikku/pikku-types.gen.js'
import { tagMiddleware } from '../middleware/tag.js'
import { wireMiddleware } from '../middleware/wire.js'
import { noOpFunction } from './no-op.function.js'

// Tag middleware for CLI
export const cliTagMiddleware = () => addMiddleware('cli', [tagMiddleware('cli')])

wireCLI({
  program: 'test-cli',
  middleware: [wireMiddleware],
  commands: {
    greet: pikkuCLICommand({
      command: 'test <name>',
      func: noOpFunction,
    }),
  },
})
