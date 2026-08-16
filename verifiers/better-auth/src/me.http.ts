import { wireHTTP } from '#pikku/http'
import { me } from './me.function.js'

wireHTTP({
  auth: true,
  route: '/me',
  method: 'get',
  func: me,
})
