import { UnauthorizedError } from '../errors/errors.js'
import { pikkuMiddleware } from '../types/core.types.js'

export const pikkuRemoteAuthMiddleware = pikkuMiddleware(
  async ({ secrets, jwt }, { http }, next) => {
    if (!http?.request || !secrets || !jwt) {
      return next()
    }

    const enabled = await secrets.hasSecret('PIKKU_REMOTE_SECRET')
    if (!enabled) {
      return next()
    }

    const authHeader =
      http.request.header('authorization') ||
      http.request.header('Authorization')

    if (!authHeader) {
      throw new UnauthorizedError()
    }

    const [scheme, token] = authHeader.split(' ')
    if (scheme !== 'Bearer' || !token) {
      throw new UnauthorizedError()
    }

    let payload: any
    try {
      payload = await jwt.decode(token)
    } catch {
      throw new UnauthorizedError()
    }

    if (payload?.aud !== 'pikku-remote') {
      throw new UnauthorizedError()
    }

    if (payload?.fn && http.request.path().startsWith('/rpc/')) {
      const fn = decodeURIComponent(http.request.path().slice('/rpc/'.length))
      if (fn && payload.fn !== fn) {
        throw new UnauthorizedError()
      }
    }

    return next()
  }
)
