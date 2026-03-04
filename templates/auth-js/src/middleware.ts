import { authJsSession } from '@pikku/auth-js'
import { addHTTPMiddleware } from '../.pikku/pikku-types.gen.js'
import { AUTH_SECRET } from './wirings/auth.wiring.js'

addHTTPMiddleware('*', [
  authJsSession({
    secret: AUTH_SECRET,
    mapSession: (claims) => ({ userId: claims.sub as string }),
  }),
])
