import { wireHTTP } from '#pikku/pikku-types.gen.js'
import { todoStream } from '../functions/sse.functions.js'

wireHTTP({
  auth: false,
  method: 'get',
  route: '/todos/stream',
  func: todoStream,
  sse: true,
  tags: ['sse', 'realtime'],
})
