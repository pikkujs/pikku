import { wireHTTP } from '../../.pikku/pikku-types.gen.js'
import { greet, remoteGreet } from '../functions/remote-rpc.functions.js'

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
