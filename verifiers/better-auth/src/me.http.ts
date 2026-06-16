import { wireHTTP } from '#pikku'
import { me } from './me.function.js'

wireHTTP({
  auth: true,
  route: '/me',
  method: 'get',
  func: me,
})
