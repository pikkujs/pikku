import { wireHTTP } from '#pikku/http'
import { processTodosProgress, todoStream } from '../functions/sse.functions.js'

// @snippet start wire-http
wireHTTP({
  method: 'get',
  route: '/todos/progress',
  func: processTodosProgress,
  sse: true,
  tags: ['sse', 'realtime'],
})
// @snippet end wire-http

wireHTTP({
  auth: false,
  method: 'get',
  route: '/todos/stream',
  func: todoStream,
  sse: true,
  tags: ['sse', 'realtime'],
})
