/**
 * Where a target gets a contributor's bindings from. `env` is plain
 * environment variables, which every target has; `cloudflare` is Cloudflare
 * worker bindings, which only the Cloudflare deploy provides.
 */
export type ContributorBindingSource = 'env' | 'cloudflare'

/** The database the generated app uses, as contributors see it at build time. */
export type ContributorDb = {
  /** The SQL engine the app's database runs on. MySQL is not represented. */
  engine: 'sqlite' | 'postgres'
  /** Column coercion map from `pikku db generate`, keyed by table then column. */
  coercionMap?: Record<string, Record<string, 'date' | 'bool' | 'json'>>
}

/**
 * Build-time facts about the app being generated. Handed to `when` while the
 * generator selects contributors and, as plain data, to `run`.
 */
export interface ContributorPlatform {
  /** Service names the app (dev) or the deploy unit requires. */
  serviceNames: string[]
  /** True when the app uses the queue, so a contributor can provide or skip a queue service. */
  needsQueue: boolean
  /** True when the app uses workflows, so a contributor can provide or skip workflow services. */
  needsWorkflow: boolean
  /** True when the app uses AI agents, so a contributor can provide or skip agent services. */
  needsAgent: boolean
  /**
   * Baseline services the generated entry already holds before any
   * contributor runs. They satisfy a contributor's `needs`, are read as
   * `runtime.<name>`, and a contributor may provide the same key to replace
   * them. Undefined means none.
   */
  runtimeServices?: string[]
  /** The app's database, when it uses SQLite or Postgres. Unset otherwise. */
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
  /**
   * Binding sources the target must be able to supply for this contributor to
   * apply. Defaults to `['env']`. A contributor the project opted in to whose
   * `requires` the target cannot meet is a build error.
   */
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

/** The per-target forms of one named contributor: a `dev` variant and a `deploy` variant. */
export interface ContributorVariants<
  TServices = any,
  TPlatform extends ContributorPlatform = ContributorPlatform,
> {
  /** The contributor `pikku dev` applies. Omit it to leave this contributor out of dev. */
  dev?: Contributor<TServices, TPlatform>
  /** The contributor a deploy build applies. Omit it to leave this contributor out of deploys. */
  deploy?: Contributor<TServices, TPlatform>
}

/** The build a contributor is selected for: `pikku dev`, or a deploy. */
export type ContributorTarget = 'dev' | 'deploy'

export interface NamedContributor<
  TServices = any,
  TPlatform extends ContributorPlatform = ContributorPlatform,
> {
  name: string
  contributor: Contributor<TServices, TPlatform>
}
