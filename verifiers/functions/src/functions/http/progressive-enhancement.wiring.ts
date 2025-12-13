import { wireChannel, wireHTTP } from '#pikku'
import { progressiveEnhancementExample } from './progressive-enhancement.functions.js'

wireHTTP({
  auth: false,
  method: 'get',
  route: '/status/sse',
  func: progressiveEnhancementExample,
})

wireChannel({
  name: 'progressive-enhancement',
  route: '/status/websocket',
  auth: false,
  onMessageWiring: {
    action: {
      status: progressiveEnhancementExample,
    },
  },
})

wireHTTP({
  auth: false,
  method: 'get',
  route: '/status/http',
  func: progressiveEnhancementExample,
  sse: true,
})
