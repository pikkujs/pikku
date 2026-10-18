// Ensure HTTP metadata is loaded before calling wireHTTP
import '../../.pikku/http/pikku-http-wirings-meta.gen.js'

import { wireHTTP } from '#pikku/http'
import { globallyDenied } from './globally-denied.function.js'

wireHTTP({
  method: 'get',
  route: '/globally-denied',
  func: globallyDenied,
  auth: false,
})
