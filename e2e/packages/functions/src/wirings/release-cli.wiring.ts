import { wireCLI, pikkuCLICommand } from '#pikku/pikku-types.gen.js'
import {
  releaseStatus,
  releasePublish,
  releaseVerify,
} from '../functions/release-cli.functions.js'

/**
 * A CLI whose commands live on the server and are reached over a websocket.
 *
 * `auth: true` puts the whole program behind a session, so an unauthenticated
 * socket cannot run any of it — the reason a client still needs a local
 * `login` even when it owns no commands.
 */
wireCLI({
  program: 'release',
  auth: true,
  commands: {
    status: pikkuCLICommand({
      func: releaseStatus,
      description: 'Show who the connection is authenticated as',
    }),

    publish: pikkuCLICommand({
      func: releasePublish,
      description: 'Publish the local checkout',
      options: {
        tag: {
          description: 'Tag to publish under',
          short: 't',
        },
      },
    }),

    verify: pikkuCLICommand({
      func: releaseVerify,
      description: 'Run release checks (always fails)',
    }),
  },
})
