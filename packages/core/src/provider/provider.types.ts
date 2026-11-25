/** The build a service is resolved for: `pikku dev`, or a deploy. */
export type ProviderTarget = 'dev' | 'deploy'

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
> {
  dev?: ProviderFactory<TNeeds, TProvides>
  deploy?: ProviderFactory<TNeeds, TProvides>
  /** Used on every target that has no variant of its own. */
  common?: ProviderFactory<TNeeds, TProvides>
  /** Runtime setup, called where the server lifecycle runs once every service is built. */
  onServerStart?(services: any): void | Promise<void>
}

export type ProviderDefinition =
  ProviderFactory<any, any> | ProviderVariants<any, any>

/** The variant of a service that applies on every target. */
export type ProviderVariantName = ProviderTarget | 'common'

/**
 * What the inspector reads from one variant: the keys its factory destructures
 * from `services`, and the keys of its return type.
 */
export interface ProviderVariantMeta {
  needs: readonly string[]
  provides: readonly string[]
}

export type ProviderMeta = Partial<
  Record<ProviderVariantName, ProviderVariantMeta>
>

/** One service picked for a target. */
export interface ResolvedProvider {
  name: string
  variant: ProviderVariantName
  needs: readonly string[]
  provides: readonly string[]
  factory: ProviderFactory
  onServerStart?: (services: any) => void | Promise<void>
}
