import { wireHTTP } from '#pikku/http/pikku-http-types.gen.js'
import { hello } from './hello.function.js'

wireHTTP({
  auth: false,
  route: '/hello',
  method: 'get',
  func: hello,
})
