import { wireHTTP } from '#pikku/http'
import { greet } from './greeting.functions.js'

wireHTTP({
  method: 'post',
  route: '/greet',
  func: greet,
  auth: false,
})
