import {
  wireCLI,
  pikkuCLICommand,
  addMiddleware,
} from '../../.pikku/pikku-types.gen.js'
import { tagMiddleware } from '../middleware/tag.js'
import { wireMiddleware } from '../middleware/wire.js'
import { noOpFunction } from './no-op.function.js'

// Tag middleware for CLI
export const cliTagMiddleware = () =>
  addMiddleware('cli', [tagMiddleware('cli')])

// Session tag middleware - re-export from shared location
export { sessionTagMiddleware } from '../middleware/fake-session.js'

wireCLI({
  program: 'test-cli',
  middleware: [wireMiddleware('cli')],
  tags: ['session', 'cli'],
  commands: {
    command: pikkuCLICommand({
      func: noOpFunction,
      middleware: [wireMiddleware('command')],
      subcommands: {
        subcommand: pikkuCLICommand({
          func: noOpFunction,
          middleware: [wireMiddleware('subcommand')],
        }),
      },
    }),
  },
})
