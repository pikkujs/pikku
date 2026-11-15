import { wireHTTP } from '#pikku/http'
import { echoBody } from './echo-body.function.js'

wireHTTP({
  auth: false,
  route: '/api/echo-body',
  method: 'post',
  func: echoBody,
})
