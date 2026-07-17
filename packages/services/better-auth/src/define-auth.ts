import type { CoreSingletonServices } from '@pikku/core'
import { pikkuState } from '@pikku/core/internal'

export interface BetterAuthInstance {
  handler: (request: Request) => Promise<Response>
  api: Record<string, any>
  /**
   * better-auth's resolved context. Optional because a hand-built instance may
   * omit it; credential unlinking needs it, since better-auth exposes no
   * session-free way to remove an account row.
   */
  $context?: Promise<any>
}

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
