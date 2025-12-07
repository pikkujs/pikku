import { wireHTTP } from '#pikku/pikku-types.gen.js'
import { login, logout, getMe } from '../functions/auth.functions.js'

wireHTTP({
  auth: false,
  method: 'post',
  route: '/auth/login',
  func: login,
  tags: ['auth'],
})

wireHTTP({
  method: 'post',
  route: '/auth/logout',
  func: logout,
  tags: ['auth'],
})

wireHTTP({
  method: 'get',
  route: '/auth/me',
  func: getMe,
  tags: ['auth'],
})
