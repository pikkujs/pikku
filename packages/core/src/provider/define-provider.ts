import type {
  ProviderCollection,
  ProviderFactory,
  ProviderVariants,
  WireProviderFactory,
  WireProviderVariants,
} from './provider.types.js'

/**
 * Declares a service. A function is the same on every target; an object gives
 * a `dev`, `deploy`, `deploy:<profile>` or `common` factory, and a target's
 * own variant overrides `common`. Read statically by the inspector:
 * dependencies are the keys the factory destructures from `services`, and what
 * it provides are the keys of its return type.
 *
 * @example snippet: defineProvider
 */
export function defineProvider<TNeeds, TProvides extends object>(
  factory: ProviderFactory<TNeeds, TProvides>
): ProviderFactory<TNeeds, TProvides>
export function defineProvider<
  TNeeds,
  TProvides extends object,
  const TOptional extends string = never,
>(
  variants: ProviderVariants<TNeeds, TProvides, TOptional>
): ProviderVariants<TNeeds, TProvides, TOptional>
export function defineProvider(definition: unknown): unknown {
  return definition
}

/**
 * Declares a service built once per invocation. The factory takes the
 * singleton services and the invocation's wire. Read statically like
 * `defineProvider`.
 *
 * @example snippet: defineWireProvider
 */
export function defineWireProvider<TNeeds, TProvides extends object>(
  factory: WireProviderFactory<TNeeds, TProvides>
): WireProviderFactory<TNeeds, TProvides>
export function defineWireProvider<TNeeds, TProvides extends object>(
  variants: WireProviderVariants<TNeeds, TProvides>
): WireProviderVariants<TNeeds, TProvides>
export function defineWireProvider(definition: unknown): unknown {
  return definition
}

/**
 * Declares a list that providers add items to with `addTo`. The name is the
 * services key readers destructure.
 *
 * @example snippet: defineProviderCollection
 */
export function defineProviderCollection<const TName extends string, TItem>(
  name: TName
): ProviderCollection<TName, TItem> {
  return { name } as ProviderCollection<TName, TItem>
}
