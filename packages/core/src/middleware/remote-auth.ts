import { UnauthorizedError } from '../errors/errors.js'
import { pikkuMiddleware } from '../types/core.types.js'
import {
  assertStrongKeyMaterial,
  decryptWithKeyMaterial,
  REMOTE_SESSION_INFO,
} from '../crypto-utils.js'

const REMOTE_RPC_PREFIX = '/remote/rpc/'

/**
 * Whether this request targets the remote-RPC surface. Compared case-insensitively
 * because the router matches routes that way (path-to-regexp defaults to
 * `sensitive: false`), so `/Remote/RPC/fn` reaches the same handler as
 * `/remote/rpc/fn`. A case-sensitive check here let a case-varied path slip
 * past the trust gate and the token's `fn` binding while still being dispatched.
 */
const isRemoteRpcPath = (path: string): boolean =>
  path.toLowerCase().startsWith(REMOTE_RPC_PREFIX)

export const pikkuRemoteAuthMiddleware = pikkuMiddleware(
  async ({ secrets, jwt }, { http, setSession }, next) => {
    if (!http?.request || !secrets) {
      return next()
    }

    let secret: string
    try {
      secret = (await secrets.getSecret('PIKKU_REMOTE_SECRET')).reveal()
    } catch {
      if (isRemoteRpcPath(http.request.path())) {
        throw new UnauthorizedError()
      }
      return next()
    }
    assertStrongKeyMaterial('PIKKU_REMOTE_SECRET', secret)

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

    if (payload?.fn && isRemoteRpcPath(http.request.path())) {
      // The prefix length is the same in any case, so slicing the raw path
      // keeps the requested function name in its original case for the compare.
      const fn = decodeURIComponent(
        http.request.path().slice(REMOTE_RPC_PREFIX.length)
      )
      if (fn && payload.fn !== fn) {
        throw new UnauthorizedError()
      }
    }

    if (payload?.session) {
      try {
        const decrypted = await decryptWithKeyMaterial<{ session?: unknown }>(
          'PIKKU_REMOTE_SECRET',
          secret,
          REMOTE_SESSION_INFO,
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
