import type { AuthInstance, CoreSingletonServices } from '@pikku/core'
import { pikkuState } from '@pikku/core/internal'

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
  Object.defineProperty(factory, PIKKU_BETTER_AUTH, {
    value: true,
    enumerable: false,
  })
  pikkuState(null, 'package', 'authFactory', factory as any)
  return factory
}
