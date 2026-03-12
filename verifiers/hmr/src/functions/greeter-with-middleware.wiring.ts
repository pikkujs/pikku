import { wireHTTP } from '#pikku'
import { greeterWithMiddleware } from './greeter-with-middleware.function.js'

wireHTTP({
  auth: false,
  route: '/api/greet-mw',
  method: 'get',
  func: greeterWithMiddleware,
})
