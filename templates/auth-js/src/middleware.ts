import { authJsSession } from '@pikku/auth-js'
import { addHTTPMiddleware } from '../.pikku/pikku-types.gen.js'

addHTTPMiddleware('*', [
  authJsSession({
    secretId: 'AUTH_SECRET',
    mapSession: (claims) => ({ userId: claims.sub as string }),
  }),
])
