import { wireHTTP } from '../.pikku/pikku-types.gen.js'
import { helloWorld } from './http.functions.js'

wireHTTP({
  auth: false,
  method: 'get',
  route: '/hello-world',
  func: helloWorld,
  tags: ['hello'],
})
