import { wireHTTP } from '#pikku'
import { greeting } from './greeting.function.js'

wireHTTP({
  auth: false,
  route: '/api/greet',
  method: 'get',
  func: greeting,
})
