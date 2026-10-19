export type ContributorBindingSource = 'env' | 'cloudflare'

export type ContributorDb = {
  engine: 'sqlite' | 'postgres'
  /** Column coercion map from `pikku db generate`, keyed by table then column. */
  coercionMap?: Record<string, Record<string, 'date' | 'bool' | 'json'>>
}

/**
 * Build-time facts about the app being generated. Handed to `when` while the
 * generator selects contributors and, as plain data, to `run`.
 */
export interface ContributorPlatform {
  serviceNames: string[]
  needsQueue: boolean
  needsWorkflow: boolean
  needsAgent: boolean
  /**
   * Baseline services the generated entry already holds before any
   * contributor runs. They satisfy a contributor's `needs`, are read as
   * `runtime.<name>`, and a contributor may provide the same key to replace
   * them. Undefined means none.
   */
  runtimeServices?: string[]
  db?: ContributorDb
}

export interface Contributor<
  TServices = any,
  TPlatform extends ContributorPlatform = ContributorPlatform,
> {
  /**
   * Service keys `run` sets on `services`. May be empty for a contributor that
   * only decorates services another contributor provides.
   */
  provides?: string[]
  /**
   * Service keys this contributor reads, from `runtime` or from `services`
   * set by another contributor. A dotted key (`logSources.stage`) is met by a
   * contributor providing it exactly or providing a prefix of it
   * (`logSources`). Contributors that provide a need run first.
   */
  needs?: string[]
  requires?: ContributorBindingSource[]
  /** Build-time only. A contributor returning false is left out entirely. */
  when?(platform: TPlatform): boolean
  /** Constructs services. Runtime `env` guards belong here, not in `when`. */
  run(
    services: TServices,
    env: Record<string, string | undefined>,
    runtime: Record<string, any>,
    platform: TPlatform
  ): void | Promise<void>
  /** Runtime setup, called where the server lifecycle runs. */
  onServerStart?(services: TServices): void | Promise<void>
  /** Teardown, called in reverse `needs` order where the server lifecycle runs. */
  onServerStop?(services: TServices): void | Promise<void>
}

export interface ContributorVariants<
  TServices = any,
  TPlatform extends ContributorPlatform = ContributorPlatform,
> {
  dev?: Contributor<TServices, TPlatform>
  deploy?: Contributor<TServices, TPlatform>
}

export type ContributorTarget = 'dev' | 'deploy'

export interface NamedContributor<
  TServices = any,
  TPlatform extends ContributorPlatform = ContributorPlatform,
> {
  name: string
  contributor: Contributor<TServices, TPlatform>
}
