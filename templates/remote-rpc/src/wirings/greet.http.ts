import { wireHTTP } from '#pikku'
import { greet, remoteGreet } from '../functions/greet.js'

wireHTTP({
  route: '/greet',
  method: 'post',
  auth: false,
  func: greet,
})

wireHTTP({
  route: '/remote-greet',
  method: 'post',
  auth: false,
  func: remoteGreet,
})
