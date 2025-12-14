import { wireHTTP } from '#pikku'
import { timeSinceOpened } from './sse.functions.js'

wireHTTP({
  auth: false,
  method: 'get',
  route: '/sse',
  func: timeSinceOpened,
  sse: true,
})
