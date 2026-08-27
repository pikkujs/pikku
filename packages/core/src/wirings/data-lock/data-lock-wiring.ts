import { pikkuState } from '../../pikku-state.js'
import { wireHTTP } from '../http/http-runner.js'
import { httpRouter } from '../http/routers/http-router.js'
import type { HTTPMethod } from '../http/http.types.js'
import type { DataLock, LockState } from '../../classification/data-lock.js'

const helperFunctionMeta = (funcId: string) => ({
  pikkuFuncId: funcId,
  sessionless: true,
  functionType: 'helper' as const,
  inputSchemaName: null,
  outputSchemaName: null,
})

export type DataLockStatus = {
  state: LockState
  /**
   * Milliseconds before another guess will be looked at, or 0.
   *
   * The unlock screen shows this as a countdown; without it the only way to
   * learn the wait is over is to guess again, and a guess made during a
   * lockout is itself a failure that extends it.
   */
  retryAfterMs: number
}

export type DataLockWiringOptions = {
  /** Where the lock routes are mounted. Defaults to `/_pikku/data`. */
  prefix?: string
  /**
   * Which keys first-run initialization mints. Derive it with
   * `keyIdsFromManifest`.
   *
   * It is fixed here rather than sent by the caller because the unlock screen
   * posts a passphrase and nothing else — and because a key the schema names
   * but nobody minted does not fail at startup, it fails at the first write to
   * that one column.
   */
  keyIds?: string[]
}

const DEFAULT_PREFIX = '/_pikku/data'

/**
 * Puts the passphrase gate on HTTP, so unlocking is a page in the app rather
 * than a prompt in whatever happens to have launched the server.
 *
 * That is what lets one story cover both shapes pikku ships in: a desktop
 * build whose window is pointed at the local server, and a headless
 * `pikku serve` somewhere else, unlock the same way and share the unlock
 * screen. A native prompt in the desktop shell would have left the headless
 * case with nothing.
 *
 * The routes are registered here rather than generated because they belong to
 * core: an app has no source file for them to be discovered in.
 */
export const wireDataLock = (
  lock: DataLock,
  { prefix = DEFAULT_PREFIX, keyIds }: DataLockWiringOptions = {}
): void => {
  const status = (): DataLockStatus => ({
    state: lock.state,
    retryAfterMs: lock.retryAfterMs,
  })

  register(prefix, 'get', '/status', 'pikkuDataLockStatus', async () =>
    status()
  )

  register(
    prefix,
    'post',
    '/initialize',
    'pikkuDataLockInitialize',
    async (_services: unknown, { passphrase }: { passphrase: string }) => {
      await lock.initialize(passphrase, keyIds)
      return status()
    }
  )

  register(
    prefix,
    'post',
    '/unlock',
    'pikkuDataLockUnlock',
    async (_services: unknown, { passphrase }: { passphrase: string }) => {
      await lock.unlock(passphrase)
      return status()
    }
  )

  register(
    prefix,
    'post',
    '/lock',
    'pikkuDataLockLock',
    async (_services: unknown, { passphrase }: { passphrase: string }) => {
      // Locking proves ownership first. An open POST here would be a
      // one-request denial of service: the store shuts and stays shut until
      // someone is around to type the passphrase back in.
      await lock.unlock(passphrase)
      lock.lock()
      return status()
    }
  )

  // A router that has already compiled its table would otherwise answer 404
  // for everything registered after it woke up.
  httpRouter.reset()
}

const register = (
  prefix: string,
  method: HTTPMethod,
  path: string,
  funcId: string,
  func: (services: any, data: any, wire: any) => Promise<DataLockStatus>
): void => {
  const route = `${prefix}${path}`
  const routes = pikkuState(null, 'http', 'routes')
  if (routes.get(method)?.has(route)) {
    return
  }

  const httpMeta = pikkuState(null, 'http', 'meta')
  httpMeta[method][route] = {
    pikkuFuncId: funcId,
    route,
    method,
    // Never a session. The gate cannot sit in front of its own key: a session
    // may itself live in a column this lock is holding shut.
    auth: false,
    requiresSession: false,
  }

  const functionsMeta = pikkuState(null, 'function', 'meta')
  if (!functionsMeta[funcId]) {
    functionsMeta[funcId] = helperFunctionMeta(funcId)
  }

  wireHTTP({
    method,
    route,
    func: { func } as never,
    auth: false,
  } as never)
}
