import { defineCLICommands } from '@pikku/core/cli'
import { FabricLogin } from './functions/login.function.js'
import { FabricStatus, renderStatus } from './functions/status.function.js'

export const fabricCommands = defineCLICommands({
  login: {
    func: FabricLogin,
    description: 'Authenticate against fabric-api',
    options: {
      apiKey: { description: 'Use a static API key instead of browser flow' },
      token: {
        description: 'Use an existing fabric token instead of browser flow',
      },
      apiUrl: { description: 'Override the fabric-api URL for this login' },
      consoleUrl: { description: 'Override the console URL the browser opens' },
      browser: {
        description:
          'Open the sign-in link automatically (--no-browser to just print it)',
        default: true,
      },
    },
  },
  status: {
    func: FabricStatus,
    render: renderStatus,
    description: 'Show the linked project status (active + in-flight deploy)',
  },
})
