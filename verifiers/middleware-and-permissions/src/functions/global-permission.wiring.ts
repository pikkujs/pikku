// Ensure HTTP metadata is loaded before calling wireHTTP
import '../../.pikku/http/pikku-http-wirings-meta.gen.js'

import { wireHTTP } from '#pikku/http'
import { globallyDenied } from './globally-denied.function.js'

// The global permission skips a call with no session, so this route needs one
// for the check to run at all.
export { sessionTagMiddleware } from '../middleware/fake-session.js'

wireHTTP({
  method: 'get',
  route: '/globally-denied',
  func: globallyDenied,
  tags: ['session'],
  auth: true,
})
