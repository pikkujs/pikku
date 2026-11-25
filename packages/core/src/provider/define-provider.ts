import type { ProviderFactory, ProviderVariants } from './provider.types.js'

/**
 * Declares a service. A function is the same on every target; an object gives
 * a `dev`, `deploy` or `common` factory, and a target's own variant overrides
 * `common`. Read statically by the inspector: dependencies are the keys the
 * factory destructures from `services`, and what it provides are the keys of
 * its return type.
 *
 * @example snippet: defineProvider
 */
export function defineProvider<TNeeds, TProvides extends object>(
  factory: ProviderFactory<TNeeds, TProvides>
): ProviderFactory<TNeeds, TProvides>
export function defineProvider<TNeeds, TProvides extends object>(
  variants: ProviderVariants<TNeeds, TProvides>
): ProviderVariants<TNeeds, TProvides>
export function defineProvider(definition: unknown): unknown {
  return definition
}
