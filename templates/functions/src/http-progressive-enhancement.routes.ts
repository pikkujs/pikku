import { addChannel, addHTTPRoute } from '../.pikku/pikku-types.gen.js'
import { progressiveEnhancementExample } from './http-progressive-enhancement.functions.js'

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
