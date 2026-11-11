import { wireScheduler } from '@pikku/core/scheduler'
import { wireTrigger } from '@pikku/core/trigger'
import { wireHTTP, defineHTTPRoutes } from '@pikku/core/http'
import { wireAddon } from '@pikku/core/addon'
import { defineChannelRoutes } from '@pikku/core/channel'
import { defineCLICommands } from '@pikku/core/cli'

const job = async () => {}

wireScheduler({ name: 'banned', schedule: '* * * * *', func: job })
wireTrigger({ name: 'banned', func: job })
wireHTTP({ method: 'get', route: '/x', func: job })
wireAddon({ name: 'nested', package: '@fixture/nested' })

export const routes = defineHTTPRoutes({
  basePath: '/api',
  routes: {
    list: { method: 'get', route: '/list', func: job, middleware: [] },
  },
})
export const clean = defineHTTPRoutes({
  routes: { list: { method: 'get', route: '/list', func: job } },
})
export const channel = defineChannelRoutes({
  chat: { func: job, permissions: {} },
})
export const cli = defineCLICommands({ permissions: { func: job } })
