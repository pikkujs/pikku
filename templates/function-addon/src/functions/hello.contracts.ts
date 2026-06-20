import { defineHTTPRoutes } from '../../.pikku/http/pikku-http-types.gen.js'
import { defineChannelRoutes } from '@pikku/core/channel'
import { defineCLICommands } from '@pikku/core/cli'
import { hello } from './hello.functions.js'

export const helloRoutes = defineHTTPRoutes({
  basePath: '/ext',
  routes: {
    hello: { method: 'get', route: '/hello', func: hello },
  },
})

export const helloChannel = defineChannelRoutes({
  hello: { func: hello },
})

export const helloCommands = defineCLICommands({
  hello: { func: hello, options: {} },
})
