import { cors } from '@pikku/core/middleware'
// `pikkuMiddleware`/`addHTTPMiddleware` come from '#pikku', not '@pikku/core':
// the generated helpers are bound to this app's SingletonServices, while the
// core ones are typed against CoreSingletonServices and reject a handler that
// reads an app service.
import { addHTTPMiddleware, pikkuMiddleware } from '#pikku/middleware'
import { allowedOrigins } from '../lib/cors-origins.js'

/**
 * `cors()` takes a static origin list, so it is built per request here rather
 * than at module load — that is what lets the list come from `variables`
 * instead of being frozen at import time, before any service exists.
 */
const corsMiddleware = pikkuMiddleware(
  async ({ variables, ...services }, { http, ...wire }, next) => {
    const middleware = cors({
      origin: await allowedOrigins(variables),
      credentials: true,
      headers: ['Content-Type', 'Authorization', 'X-Auth-Return-Redirect'],
    })
    // Both parameters are destructured and reassembled because the inspector
    // fails the build on an undestructured one (PKU410/PKU411, critical). The
    // delegate reads only `http` and no service at all.
    await middleware({ variables, ...services }, { http, ...wire }, next)
  }
)

addHTTPMiddleware('*', [corsMiddleware])
