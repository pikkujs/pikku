import type {
  PikkuServiceFactory,
  PikkuServiceVariants,
} from './pikku-service.types.js'

/**
 * Declares a service. A function is the same on every target; an object gives
 * a `dev`, `deploy` or `common` factory, and a target's own variant overrides
 * `common`. Read statically by the inspector: dependencies are the keys the
 * factory destructures from `services`, and what it provides are the keys of
 * its return type.
 *
 * @example snippet: pikkuService
 */
export function pikkuService<TNeeds, TProvides extends object>(
  factory: PikkuServiceFactory<TNeeds, TProvides>
): PikkuServiceFactory<TNeeds, TProvides>
export function pikkuService<TNeeds, TProvides extends object>(
  variants: PikkuServiceVariants<TNeeds, TProvides>
): PikkuServiceVariants<TNeeds, TProvides>
export function pikkuService(definition: unknown): unknown {
  return definition
}
