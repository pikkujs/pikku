import { wireHTTP } from '#pikku/http/pikku-http-types.gen.js'
import { me } from './me.function.js'

wireHTTP({
  auth: true,
  route: '/me',
  method: 'get',
  func: me,
})
