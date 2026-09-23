import type { CoreSingletonServices } from '@pikku/core/types'
import type { AuthInstance } from '@pikku/core/types'
import { pikkuState } from '@pikku/core/state'
import { applyStatelessCookieCacheDefault } from './stateless-cookie-default.js'

/**
 * better-auth's instance as pikku sees it. `$context` is what credential
 * unlinking needs, since better-auth exposes no session-free way to remove an
 * account row.
 */
export interface BetterAuthInstance extends AuthInstance {}

export const PIKKU_BETTER_AUTH = Symbol.for('pikku.betterAuth')

export type PikkuBetterAuthFactory<
  I extends BetterAuthInstance = BetterAuthInstance,
  S extends CoreSingletonServices = CoreSingletonServices,
> = (services: S) => I | Promise<I>

export const pikkuBetterAuth = <
  I extends BetterAuthInstance,
  S extends CoreSingletonServices = CoreSingletonServices,
>(
  factory: PikkuBetterAuthFactory<I, S>
): PikkuBetterAuthFactory<I, S> => {
  /*
   * The instance is handed back through a wrapper so pikku gets one look at it
   * before anything uses it — see `applyStatelessCookieCacheDefault`, which gives
   * the session cookie a usable lifetime when the app left it unset and the
   * stateless middleware is the thing authenticating requests.
   *
   * Only the RUNTIME is wrapped. The CLI reads `pikkuBetterAuth(async ({ ... }) =>
   * ...)` off the app's own AST — the destructured services, the inner
   * `betterAuth({ ... })` call, its providers and `session.cookieCache` — so
   * inspection is untouched by anything that happens here.
   *
   * Returning a promise is safe: every consumer already treats the factory's
   * result as one (`services.auth()` resolves it lazily and caches it).
   */
  const wrapped: PikkuBetterAuthFactory<I, S> = async (services) => {
    const instance = await factory(services)
    await applyStatelessCookieCacheDefault(instance, services as any)
    return instance
  }

  Object.defineProperty(wrapped, PIKKU_BETTER_AUTH, {
    value: true,
    enumerable: false,
  })
  /* The app's own function, for anything reaching for `.toString()` or the name. */
  Object.defineProperty(wrapped, 'pikkuSourceFactory', {
    value: factory,
    enumerable: false,
  })
  pikkuState(null, 'package', 'authFactory', wrapped as any)
  return wrapped
}
