import { wireHTTP } from '../../.pikku/pikku-types.gen.js'
import { processTodosProgress, todoStream } from '../functions/sse.functions.js'

wireHTTP({
  method: 'get',
  route: '/todos/progress',
  func: processTodosProgress,
  sse: true,
  tags: ['sse', 'realtime'],
})

wireHTTP({
  auth: false,
  method: 'get',
  route: '/todos/stream',
  func: todoStream,
  sse: true,
  tags: ['sse', 'realtime'],
})
