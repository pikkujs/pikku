import { wireHTTP } from '#pikku/http'
import { greeterWithMiddleware } from './greeter-with-middleware.function.js'

wireHTTP({
  auth: false,
  route: '/api/greet-mw',
  method: 'get',
  func: greeterWithMiddleware,
})
