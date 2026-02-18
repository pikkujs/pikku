import { UnauthorizedError } from '../errors/errors.js'
import { pikkuMiddleware } from '../types/core.types.js'
import { decryptJSON } from '../crypto-utils.js'

export const pikkuRemoteAuthMiddleware = pikkuMiddleware(
  async ({ secrets, jwt }, { http, setSession }, next) => {
    if (!http?.request || !secrets) {
      return next()
    }

    let secret: string
    try {
      secret = await secrets.getSecret('PIKKU_REMOTE_SECRET')
    } catch {
      return next()
    }
    if (!jwt) {
      throw new Error('PIKKU_REMOTE_SECRET set but JWT service missing')
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

    if (payload?.session) {
      try {
        const decrypted = await decryptJSON<{ session?: unknown }>(
          secret,
          payload.session
        )
        if (decrypted?.session && setSession) {
          await setSession(decrypted.session)
        }
      } catch {
        throw new UnauthorizedError()
      }
    }

    return next()
  }
)
