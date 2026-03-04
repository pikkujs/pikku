import { authJsSession } from '@pikku/auth-js'
import { addHTTPMiddleware } from '../.pikku/pikku-types.gen.js'
import { AUTH_SECRET_ID } from './wirings/auth.wiring.js'

addHTTPMiddleware('*', [
  authJsSession({
    secretId: AUTH_SECRET_ID,
    mapSession: (claims) => ({ userId: claims.sub as string }),
  }),
])
