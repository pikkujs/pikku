/** The build a service is resolved for: `pikku dev`, or a deploy. */
export type PikkuServiceTarget = 'dev' | 'deploy'

export type PikkuServiceEnv = Record<string, string | undefined>

/**
 * Builds services. Destructure `services` to say what it depends on; the
 * object it returns is what it provides, by key. Runtime `env` guards belong
 * here.
 */
export type PikkuServiceFactory<
  TNeeds = any,
  TProvides extends object = Record<string, unknown>,
> = (services: TNeeds, env: PikkuServiceEnv) => TProvides | Promise<TProvides>

/** The per-target forms of one service. A target-specific variant overrides `common`. */
export interface PikkuServiceVariants<
  TNeeds = any,
  TProvides extends object = Record<string, unknown>,
> {
  dev?: PikkuServiceFactory<TNeeds, TProvides>
  deploy?: PikkuServiceFactory<TNeeds, TProvides>
  /** Used on every target that has no variant of its own. */
  common?: PikkuServiceFactory<TNeeds, TProvides>
  /** Runtime setup, called where the server lifecycle runs once every service is built. */
  onServerStart?(services: any): void | Promise<void>
}

export type PikkuServiceDefinition =
  PikkuServiceFactory<any, any> | PikkuServiceVariants<any, any>

/** The variant of a service that applies on every target. */
export type PikkuServiceVariantName = PikkuServiceTarget | 'common'

/**
 * What the inspector reads from one variant: the keys its factory destructures
 * from `services`, and the keys of its return type.
 */
export interface PikkuServiceVariantMeta {
  needs: readonly string[]
  provides: readonly string[]
}

export type PikkuServiceMeta = Partial<
  Record<PikkuServiceVariantName, PikkuServiceVariantMeta>
>

/** One service picked for a target. */
export interface ResolvedPikkuService {
  name: string
  variant: PikkuServiceVariantName
  needs: readonly string[]
  provides: readonly string[]
  factory: PikkuServiceFactory
  onServerStart?: (services: any) => void | Promise<void>
}
