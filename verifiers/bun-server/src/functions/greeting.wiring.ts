import { wireHTTP } from '#pikku/http'
import { greeting } from './greeting.function.js'

wireHTTP({
  auth: false,
  route: '/api/greet',
  method: 'get',
  func: greeting,
})
