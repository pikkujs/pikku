import { UnauthorizedError } from '../errors/errors.js'
import { pikkuMiddleware } from './middleware-factories.js'
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

/**
 * Authenticates calls between deployments of the same app, on the generated
 * remote-RPC route. Once `PIKKU_REMOTE_SECRET` is set it requires a
 * `Bearer` JWT with audience `pikku-remote`; a token bound to a function (`fn`)
 * is only accepted on that function's `/remote/rpc/<fn>` path, and any session
 * it carries is decrypted with the secret and set on the wire.
 *
 * Without the secret it lets non-remote paths through and refuses
 * `/remote/rpc/*`, so the remote surface fails closed.
 *
 * @throws {UnauthorizedError} On a missing, malformed, mis-addressed or
 * undecryptable token.
 * @throws {WeakKeyMaterialError} When the secret is too short to use.
 * @throws {Error} When the secret is set but no JWT service is configured.
 */
export const pikkuRemoteAuthMiddleware = pikkuMiddleware(
  async ({ secrets, jwt }, { http, setInitialSession }, next) => {
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
        if (decrypted?.session && setInitialSession) {
          setInitialSession(decrypted.session)
        }
      } catch {
        throw new UnauthorizedError()
      }
    }

    return next()
  }
)
