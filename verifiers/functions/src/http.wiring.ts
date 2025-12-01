import { wireHTTP } from '../.pikku/pikku-types.gen.js'
import { helloWorld, welcomeToPikku } from './http.functions.js'

wireHTTP({
  auth: false,
  method: 'get',
  route: '/',
  func: welcomeToPikku,
  tags: ['welcome'],
})

wireHTTP({
  auth: false,
  method: 'get',
  route: '/hello-world',
  func: helloWorld,
  tags: ['hello'],
})
