// Stand-in for the @pikku/core/provider surface the providers fixture reads,
// wired through tsconfig `paths`, so the fixture resolves without a built core.
/** The invocation's wire. */
export interface PikkuWire {
  [key: string]: unknown
}

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

/** What a Cloudflare Worker's `env` holds: bindings (a database, a queue), not only strings. */
export type ProviderWorkerEnv = Readonly<Record<string, unknown>>

/**
 * Builds services. Destructure `services` to say what it depends on; the
 * object it returns is what it provides, by key. Runtime `env` guards belong
 * here.
 */
export type ProviderFactory<
  TNeeds = any,
  TProvides extends object = Record<string, unknown>,
  TEnv = ProviderEnv,
> = (services: TNeeds, env: TEnv) => TProvides | Promise<TProvides>

/** The per-target forms of one service. A target-specific variant overrides `common`. */
export interface ProviderVariants<
  TNeeds = any,
  TProvides extends object = Record<string, unknown>,
  TOptional extends string = string,
> {
  dev?: ProviderFactory<TNeeds, TProvides>
  deploy?: ProviderFactory<TNeeds, TProvides>
  'deploy:standalone'?: ProviderFactory<TNeeds, TProvides>
  'deploy:cloudflare-worker'?: ProviderFactory<
    TNeeds,
    TProvides,
    ProviderWorkerEnv
  >
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
  | ProviderFactory<any, any>
  | ProviderVariants<any, any>
  | WireProviderFactory<any, any>
  | WireProviderVariants<any, any>

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

/** What an addon's provider may read of the host's environment. */
export interface ProviderAddonScope {
  /** The `wireAddon` name: the namespace in the provider's name. */
  namespace: string
  /** The names the addon declares with `defineVariable`/`defineSecret`. */
  env: readonly string[]
  /** The host name behind a name the addon reads, from `variableOverrides` and `secretOverrides`. */
  envRename?: Readonly<Record<string, string>>
  /** The credentials the addon declares, plus the ones the host lends it. Absent leaves `credentialService` as the host's. */
  credentials?: readonly string[]
  /** The host handed the addon the whole `credentialService` (`globalCredentials`). */
  globalCredentials?: boolean
  /** The folder of the content store the addon owns, and the paths outside it the host lends. Absent leaves `content` as the host's. */
  content?: {
    bucket: string
    grants?: Readonly<Record<string, 'read' | 'write'>>
  }
  /** The host handed the addon the whole `content` service (`globalContent`). */
  globalContent?: boolean
}

/** What the build knows about a provider beyond what its variants read. */
export interface ProviderRegistration {
  kind: 'singleton' | 'wire'
  /** The collection this provider adds one item to. Read from the definition when not given. */
  addTo?: string
  /** Set for a provider opted in from an addon: it gets a scoped `env`, never the host's. */
  addon?: ProviderAddonScope
}

/** One service picked for a target. */
export interface ResolvedProvider {
  name: string
  variant: ProviderVariantName
  needs: readonly string[]
  optional: readonly string[]
  provides: readonly string[]
  optionalProvides: readonly string[]
  factory: ProviderFactory
  addon?: ProviderAddonScope
  /** The collection this provider adds one item to; it provides no key. */
  addTo?: string
  onServerStart?: (services: any) => void | Promise<void>
}

declare const collectionBrand: unique symbol

/** A list providers add to. The name is the services key readers destructure. */
export interface ProviderCollection<TName extends string, TItem> {
  /** The services key readers destructure. */
  readonly name: TName
  readonly [collectionBrand]?: { item: TItem }
}

/** One item a provider added to a collection, under the provider's name. */
export interface ProviderCollectionEntry<TItem> {
  /** The contributing provider's name: `<namespace>/<export>` or `<export>`. */
  readonly label: string
  /** What the provider returned for the collection. */
  readonly item: TItem
}

/** The collection's key in the services holds the entries, sorted by label. */
export type ProviderCollectionValue<TItem> =
  readonly ProviderCollectionEntry<TItem>[]

/** The item type of a collection. */
export type ProviderCollectionItem<TCollection> =
  TCollection extends ProviderCollection<string, infer TItem> ? TItem : never

/** The per-target forms of one per-request service. */
export type WireProviderVariants<
  TNeeds = any,
  TProvides extends object = Record<string, unknown>,
  TOptional extends string = string,
> = {
  [
    V in Exclude<
      keyof ProviderVariants,
      'onServerStart' | 'addTo' | 'optional' | 'replaces'
    >
  ]?: WireProviderFactory<TNeeds, TProvides>
} & {
  /** Needs that may be absent: string literals, read statically. */
  optional?: readonly TOptional[]
  /** Protected keys this provider deliberately provides: string literals, read statically. */
  replaces?: readonly string[]
}

/** Builds a per-request service. `wire` is the invocation's wire, unchanged. */
export type WireProviderFactory<
  TNeeds = any,
  TProvides extends object = Record<string, unknown>,
> = (services: TNeeds, wire: PikkuWire) => TProvides | Promise<TProvides>

/** What the runner passes `WireProviders.run` besides the services and the wire. */
export interface WireProviderRunOptions {
  /** The keys the function destructures. Every provider is built when absent. */
  needs?: readonly string[]
  /** Keys the runner builds itself, readable by a provider that declares them. */
  held?: Record<string, unknown>
}

/** What the generated provider runner registers: builds one invocation's per-request services. */
export type CreateProviderWireServices = (
  singletons: object,
  wire: PikkuWire,
  options?: WireProviderRunOptions
) => Promise<WireProviderRun>

/** What `WireProviders.run` hands the runner for one invocation. */
export interface WireProviderRun {
  /** The keys the wire providers built. */
  services: Record<string, unknown>
  /** Stops what was built, latest provider first. A failing `stop()` is logged and does not stop the others. */
  stop(): Promise<void>
}

/**
 * Declares a service. A function is the same on every target; an object gives
 * a `dev`, `deploy`, `deploy:<profile>` or `common` factory, and a target's
 * own variant overrides `common`. Read statically by the inspector:
 * dependencies are the keys the factory destructures from `services`, and what
 * it provides are the keys of its return type.
 */
export declare function defineProvider<TNeeds, TProvides extends object>(
  factory: ProviderFactory<TNeeds, TProvides>
): ProviderFactory<TNeeds, TProvides>
export declare function defineProvider<
  TNeeds,
  TName extends string,
  TItem extends object,
  const TOptional extends string = never,
>(
  variants: ProviderVariants<TNeeds, TItem, TOptional> & {
    addTo: ProviderCollection<TName, TItem>
  }
): ProviderVariants<TNeeds, TItem, TOptional>
export declare function defineProvider<
  TNeeds,
  TProvides extends object,
  const TOptional extends string = never,
>(
  variants: ProviderVariants<TNeeds, TProvides, TOptional>
): ProviderVariants<TNeeds, TProvides, TOptional>

/**
 * Declares a service built once per invocation. The factory takes the
 * singleton services and the invocation's wire. Read statically like
 * `defineProvider`.
 */
export declare function defineWireProvider<TNeeds, TProvides extends object>(
  factory: WireProviderFactory<TNeeds, TProvides>
): WireProviderFactory<TNeeds, TProvides>
export declare function defineWireProvider<
  TNeeds,
  TProvides extends object,
  const TOptional extends string = never,
>(
  variants: WireProviderVariants<TNeeds, TProvides, TOptional>
): WireProviderVariants<TNeeds, TProvides, TOptional>

/**
 * Declares a list that providers add items to with `addTo`. The name is the
 * services key readers destructure.
 */
export declare function defineProviderCollection<const TName extends string, TItem>(
  name: TName
): ProviderCollection<TName, TItem>
