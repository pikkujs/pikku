import { defineHTTPRoutes } from '#pikku/addon/http/pikku-http-types.gen.js'
import { defineChannelRoutes } from '@pikku/core/channel'
import { defineCLICommands } from '@pikku/core/cli'
import { listTodos } from './functions/listTodos.function.js'

export const todoRoutes = defineHTTPRoutes({
  basePath: '/todos',
  routes: {
    list: { method: 'get', route: '/', func: listTodos },
  },
})

export const todoChannel = defineChannelRoutes({
  list: { func: listTodos },
})

export const todoCommands = defineCLICommands({
  list: { func: listTodos, options: {} },
})
