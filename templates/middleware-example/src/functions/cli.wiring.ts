import {
  wireCLI,
  pikkuCLICommand,
  addMiddleware,
} from '../../.pikku/pikku-types.gen.js'
import { globalMiddleware } from '../middleware/global.js'
import { wireMiddleware } from '../middleware/wire.js'
import { noOpFunction } from './no-op.function.js'

// Tag middleware for CLI
export const cliTagMiddleware = () => addMiddleware('cli', [globalMiddleware])

wireCLI({
  program: 'test-cli',
  middleware: [wireMiddleware],
  commands: {
    greet: pikkuCLICommand({
      command: 'greet <name>',
      func: noOpFunction,
      description: 'Greet a user by name',
    }),
  },
})
