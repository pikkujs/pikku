import type { PikkuWire } from '../types/core.types.js'

/** The build a service is resolved for: `pikku dev`, or a deploy. */
export type ProviderTarget = 'dev' | 'deploy'

/** The deploy runtimes a `deploy:<profile>` variant may name. */
export const PROVIDER_PROFILES = [
  'standalone',
  'cloudflare-worker',
  'cloudflare-container',
  'server',
] as const
export type ProviderProfile = (typeof PROVIDER_PROFILES)[number]

export type ProviderEnv = Record<string, string | undefined>

/**
 * Builds services. Destructure `services` to say what it depends on; the
 * object it returns is what it provides, by key. Runtime `env` guards belong
 * here.
 */
export type ProviderFactory<
  TNeeds = any,
  TProvides extends object = Record<string, unknown>,
> = (services: TNeeds, env: ProviderEnv) => TProvides | Promise<TProvides>

/** The per-target forms of one service. A target-specific variant overrides `common`. */
export interface ProviderVariants<
  TNeeds = any,
  TProvides extends object = Record<string, unknown>,
  TOptional extends string = string,
> {
  dev?: ProviderFactory<TNeeds, TProvides>
  deploy?: ProviderFactory<TNeeds, TProvides>
  'deploy:standalone'?: ProviderFactory<TNeeds, TProvides>
  'deploy:cloudflare-worker'?: ProviderFactory<TNeeds, TProvides>
  'deploy:cloudflare-container'?: ProviderFactory<TNeeds, TProvides>
  'deploy:server'?: ProviderFactory<TNeeds, TProvides>
  /** Used on every target that has no variant of its own. */
  common?: ProviderFactory<TNeeds, TProvides>
  /** Needs that may be absent: string literals, read statically. */
  optional?: readonly TOptional[]
  /** Protected keys this provider deliberately provides: string literals, read statically. */
  replaces?: readonly string[]
  /** The collection this provider adds one item to; its factories return that item. */
  addTo?: ProviderCollection<string, any>
  /** Runtime setup, called where the server lifecycle runs once every service is built. */
  onServerStart?(services: any): void | Promise<void>
}

export type ProviderDefinition =
  ProviderFactory<any, any> | ProviderVariants<any, any>

/** A variant a service may declare: one target, one deploy profile, or every target. */
export type ProviderVariantName =
  ProviderTarget | `deploy:${ProviderProfile}` | 'common'

/**
 * The type a factory destructures when some of its needs may be absent: those
 * keys become optional.
 */
export type WithOptional<TServices, K extends PropertyKey> = Omit<
  TServices,
  K
> &
  Partial<Pick<TServices, Extract<K, keyof TServices>>>

/**
 * What the inspector reads from one variant: the keys its factory destructures
 * from `services`, and the keys of its return type.
 */
export interface ProviderVariantMeta {
  needs: readonly string[]
  /** The subset of `needs` the provider works without. */
  optional?: readonly string[]
  provides: readonly string[]
  /** The subset of `provides` that is optional in the return type. */
  optionalProvides?: readonly string[]
}

export type ProviderMeta = Partial<
  Record<ProviderVariantName, ProviderVariantMeta>
>

/** One service picked for a target. */
export interface ResolvedProvider {
  name: string
  variant: ProviderVariantName
  needs: readonly string[]
  optional: readonly string[]
  provides: readonly string[]
  optionalProvides: readonly string[]
  factory: ProviderFactory
  onServerStart?: (services: any) => void | Promise<void>
}

declare const collectionBrand: unique symbol

/** A list providers add to. The name is the services key readers destructure. */
export interface ProviderCollection<TName extends string, TItem> {
  readonly name: TName
  readonly [collectionBrand]?: { item: TItem }
}

/** The per-target forms of one per-request service. */
export type WireProviderVariants<
  TNeeds = any,
  TProvides extends object = Record<string, unknown>,
> = {
  [
    V in Exclude<
      keyof ProviderVariants,
      'onServerStart' | 'addTo' | 'optional' | 'replaces'
    >
  ]?: WireProviderFactory<TNeeds, TProvides>
} & Pick<ProviderVariants, 'optional' | 'replaces'>

/** Builds a per-request service. `wire` is the invocation's wire, unchanged. */
export type WireProviderFactory<
  TNeeds = any,
  TProvides extends object = Record<string, unknown>,
> = (services: TNeeds, wire: PikkuWire) => TProvides | Promise<TProvides>
