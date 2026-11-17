import { wireHTTP } from '#pikku/http'
import { wireScheduler } from '#pikku/scheduler'
import { wireAddon } from '#pikku/addon'
import { greetVia, ping, tick } from './functions/app.functions.js'

wireAddon({
  name: 'tools',
  package: '@pikku/verifier-ba-tools',
  expose: true,
})

wireHTTP({ method: 'get', route: '/ping', func: ping, auth: false })

wireHTTP({ method: 'get', route: '/greet', func: greetVia, auth: false })

wireScheduler({ name: 'tick', schedule: '*/5 * * * *', func: tick })
