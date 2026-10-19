import { UnauthorizedError } from '../errors/errors.js'
import { pikkuMiddleware } from './middleware-factories.js'
import {
  assertStrongKeyMaterial,
  decryptWithKeyMaterial,
  MESH_SESSION_INFO,
} from '../crypto-utils.js'

const MESH_RPC_PREFIX = '/mesh/rpc/'

/**
 * Whether this request targets the mesh-RPC surface. Compared case-insensitively
 * because the router matches routes that way (path-to-regexp defaults to
 * `sensitive: false`), so `/Mesh/RPC/fn` reaches the same handler as
 * `/mesh/rpc/fn`. A case-sensitive check here let a case-varied path slip
 * past the trust gate and the token's `fn` binding while still being dispatched.
 */
const isMeshRpcPath = (path: string): boolean =>
  path.toLowerCase().startsWith(MESH_RPC_PREFIX)

/**
 * Authenticates calls between deployments of the same app, on the generated
 * mesh-RPC route. Once `PIKKU_MESH_SECRET` is set it requires a
 * `Bearer` JWT with audience `pikku-mesh`; a token bound to a function (`fn`)
 * is only accepted on that function's `/mesh/rpc/<fn>` path, and any session
 * it carries is decrypted with the secret and set on the wire.
 *
 * Without the secret it lets non-mesh paths through and refuses
 * `/mesh/rpc/*`, so the mesh surface fails closed.
 *
 * @throws {UnauthorizedError} On a missing, malformed, mis-addressed or
 * undecryptable token.
 * @throws {WeakKeyMaterialError} When the secret is too short to use.
 * @throws {Error} When the secret is set but no JWT service is configured.
 */
export const pikkuMeshAuthMiddleware = pikkuMiddleware(
  async ({ secrets, jwt }, { http, setInitialSession }, next) => {
    if (!http?.request || !secrets) {
      return next()
    }

    let secret: string
    try {
      secret = (await secrets.getSecret('PIKKU_MESH_SECRET')).reveal()
    } catch {
      if (isMeshRpcPath(http.request.path())) {
        throw new UnauthorizedError()
      }
      return next()
    }
    assertStrongKeyMaterial('PIKKU_MESH_SECRET', secret)

    if (!jwt) {
      throw new Error('PIKKU_MESH_SECRET set but JWT service missing')
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

    if (payload?.aud !== 'pikku-mesh') {
      throw new UnauthorizedError()
    }

    if (payload?.fn && isMeshRpcPath(http.request.path())) {
      // The prefix length is the same in any case, so slicing the raw path
      // keeps the requested function name in its original case for the compare.
      const fn = decodeURIComponent(
        http.request.path().slice(MESH_RPC_PREFIX.length)
      )
      if (fn && payload.fn !== fn) {
        throw new UnauthorizedError()
      }
    }

    if (payload?.session) {
      try {
        const decrypted = await decryptWithKeyMaterial<{ session?: unknown }>(
          'PIKKU_MESH_SECRET',
          secret,
          MESH_SESSION_INFO,
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
