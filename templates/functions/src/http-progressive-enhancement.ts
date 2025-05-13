import { addHTTPRoute } from '@pikku/core'
import { addChannel, pikkuSessionlessFunc } from '../.pikku/pikku-types.gen.js'

export const progressiveEnhancementExample = pikkuSessionlessFunc<
  void,
  { state: 'initial' | 'pending' | 'done' }
>(async (services) => {
  if (services?.channel) {
    setTimeout(() => {
      services.channel?.send({ state: 'pending' })
    }, 2500)
    setTimeout(() => {
      services.channel?.send({ state: 'done' })
    }, 5000)
  }
  return { state: 'initial' }
})

addHTTPRoute({
  auth: false,
  method: 'get',
  route: '/status/sse',
  func: progressiveEnhancementExample,
})

addChannel({
  name: 'progressive-enhancement',
  route: '/status/websocket',
  auth: false,
  onMessageRoute: {
    action: {
      status: progressiveEnhancementExample,
    },
  },
})

addHTTPRoute({
  auth: false,
  method: 'get',
  route: '/status/http',
  func: progressiveEnhancementExample,
  sse: true,
})
