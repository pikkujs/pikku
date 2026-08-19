import type { InspectorFilters } from '@pikku/inspector'
import type { OpenAPISpecInfo } from '@pikku/inspector'
import { PikkuWiringTypes } from '@pikku/core/types'

/**
 * Whether a generated surface exists and where it is written.
 *
 * `true` enables it at the path derived from `pikkuDir`; an object enables it
 * and overrides that path. It says nothing about who may call the surface —
 * authentication is declared on the function, its wiring, its scopes and its
 * addon, and is enforced there on every call. A scaffold flag that also opened
 * or closed the door would only stack a coarser gate in front of that one.
 *
 * A bare string is refused by the loader rather than reinterpreted: under this
 * shape a string could plausibly mean a path, so guessing one would be worse
 * than failing. See `resolveScaffoldFeature`.
 */
export type PikkuScaffoldFeature =
  | boolean
  | {
      /** Write the generated file here instead of deriving it from `pikkuDir`. */
      path?: string
    }

export interface PikkuCLICoreOutputFiles {
  // Base directory
  outDir: string

  // Schema and types
  schemaDirectory: string

  // Function definitions
  functionsFile: string
  functionsMetaFile: string
  functionsMetaJsonFile: string
  functionTypesFile: string

  // HTTP
  httpWiringsFile: string
  httpWiringMetaFile: string
  httpWiringMetaJsonFile: string
  httpContractsMetaJsonFile: string
  httpContractsMetaFile: string
  httpMapDeclarationFile: string
  httpTypesFile: string

  // Gateways
  gatewaysWiringFile: string
  gatewaysWiringMetaFile: string
  gatewaysWiringMetaJsonFile: string

  // Channels
  channelsWiringFile: string
  channelsWiringMetaFile: string
  channelsWiringMetaJsonFile: string
  channelContractsMetaJsonFile: string
  channelContractsMetaFile: string
  channelsMapDeclarationFile: string
  channelsTypesFile: string

  // RPC Internal
  rpcInternalWiringMetaFile: string
  rpcInternalWiringMetaJsonFile: string
  rpcInternalMapDeclarationFile: string

  // RPC Exposed
  rpcMapDeclarationFile: string

  // RPC Remote — the `remote: true` surface a wireRemoteAddon consumer imports
  rpcRemoteMapDeclarationFile: string

  // Remote RPC workers (derived from scaffold.pikkuDir when scaffold.remoteRpc is enabled).
  // Optional: left undefined when scaffold.remoteRpc is not enabled, so consumers must guard.
  remoteRpcWorkersFile?: string
  remoteRpcSchemasFile?: string

  // wireAddon for @pikku/addon-graph (derived from scaffold.pikkuDir when scaffold.graph is enabled).
  // Optional: left undefined when scaffold.graph is not enabled, so consumers must guard.
  graphWiringsFile?: string

  // Outgoing webhook delivery worker (derived from scaffold.pikkuDir when scaffold.webhook is enabled).
  // Optional: left undefined when scaffold.webhook is not enabled, so consumers must guard.
  webhookWorkersFile?: string
  webhookSchemasFile?: string

  // Feature-generated files (derived from scaffold.pikkuDir when enabled)
  publicRpcFile: string
  publicRpcSchemasFile?: string
  publicAgentFile: string
  publicAgentSchemasFile?: string
  consoleFunctionsFile: string
  consoleSchemasFile?: string
  scenariosFunctionsFile: string
  scenariosSchemasFile?: string

  // User administration functions (derived from scaffold.pikkuDir when scaffold.userAdmin is enabled).
  // Optional: left undefined when scaffold.userAdmin is not enabled, so consumers must guard.
  userAdminFunctionsFile?: string
  userAdminSchemasFile?: string

  // Virtual user run/read RPCs (derived from scaffold.pikkuDir when scaffold.virtualUser is enabled).
  // Optional: left undefined when scaffold.virtualUser is not enabled, so consumers must guard.
  virtualUserFunctionsFile?: string
  virtualUserSchemasFile?: string
  workflowRoutesFile: string
  workflowRoutesSchemasFile?: string
  eventsChannelFile: string
  eventsSchemasFile?: string

  // Triggers
  gatewaysTypesFile: string
  triggersTypesFile: string
  triggersWiringFile: string
  triggersWiringMetaFile: string
  triggersWiringMetaJsonFile: string
  triggerSourcesMetaFile: string
  triggerSourcesMetaJsonFile: string

  // Schedulers
  schedulersWiringFile: string
  schedulersWiringMetaFile: string
  schedulersWiringMetaJsonFile: string
  schedulersTypesFile: string

  // Queue processors
  queueWorkersWiringFile: string
  queueWorkersWiringMetaFile: string
  queueWorkersWiringMetaJsonFile: string
  queueMapDeclarationFile: string
  queueTypesFile: string

  // Workflows
  workflowsWiringFile: string
  workflowsWiringMetaFile: string
  workflowsWorkersFile: string
  workflowMapDeclarationFile: string
  scenarioStepMapDeclarationFile: string
  workflowTypesFile: string
  workflowMetaDir: string

  // Scenarios — kept out of the app bootstrap so a deployed server never
  // imports a step body (and whatever a step imports).
  scenarioTypesFile: string
  /** The actors a scenario drives — distinct from `scopes/pikku-personas.gen.ts`, which declares them. */
  personasWiringFile: string
  scenarioStepsFile: string
  scenarioStepsMetaFile: string
  scenarioStepsMetaJsonFile: string
  scenarioWiringsFile: string
  scenarioWiringsMetaFile: string
  scenarioMetaDir: string
  /** Where schemas only a scenario or a step needs are written and registered. */
  scenarioSchemaDirectory: string
  scenarioBootstrapFile: string

  // MCP
  mcpWiringsFile: string
  mcpWiringsMetaFile: string
  mcpWiringsMetaJsonFile: string
  mcpTypesFile: string
  mcpJsonFile: string

  // AI Agent
  agentWiringsFile: string
  agentWiringMetaFile: string
  agentWiringMetaJsonFile: string
  agentTypesFile: string
  agentMapDeclarationFile: string
  modelAliasesFile: string

  // AI Scorer
  scorerWiringsFile: string
  scorerWiringMetaFile: string
  scorerWiringMetaJsonFile: string
  scorerNamesDeclarationFile: string

  // AI Scorer
  scorerWiringsFile: string
  scorerWiringMetaFile: string
  scorerWiringMetaJsonFile: string
  scorerNamesDeclarationFile: string

  // CLI
  cliWiringsFile: string
  cliWiringMetaFile: string
  cliWiringMetaJsonFile: string
  cliContractsMetaJsonFile: string
  cliContractsMetaFile: string
  cliBootstrapFile: string
  cliTypesFile: string

  // Services
  servicesFile: string

  // Middleware
  middlewareFile: string
  middlewareGroupsMetaJsonFile: string

  // Middleware authoring surface (the leaf `#pikku/middleware` resolves to)
  middlewareTypesFile: string

  // Config and service factories (the leaf `#pikku/setup` resolves to)
  setupTypesFile: string

  // Permissions, auth gates and credential definitions (part of `#pikku/auth`)
  authGuardsFile: string

  // Permissions
  permissionsFile: string
  permissionsGroupsMetaJsonFile: string

  // Application bootstrap
  bootstrapFile: string

  // Package service factories (for addon packages)
  packageFile: string

  // Addon install surface, for an application (the leaf `#pikku/addon`)
  addonTypesFile: string

  // Addon authoring surface, joining the setup leaf of an addon's own tree
  // (`#pikku/addon/setup`) where an application writes the app-flavoured one
  addonSetupTypesFile: string

  // Error catalogue (the leaf `#pikku/error` resolves to)
  errorTypesFile: string

  // Secrets
  secretTypesFile: string

  // Secrets (typed wrapper for SecretService)
  secretsFile: string

  // Secrets metadata JSON
  secretsMetaJsonFile: string

  // Credentials (typed wrapper for CredentialService)
  credentialsFile: string

  // Credentials metadata JSON
  credentialsMetaJsonFile: string

  // Scopes
  scopeTypesFile: string

  // Scopes (ScopeId union + declared scope set)
  scopesFile: string

  // Scopes metadata JSON
  scopesMetaJsonFile: string

  // System roles (SystemRoleName union + declared role set)
  rolesFile: string

  // System roles metadata JSON
  rolesMetaJsonFile: string

  // Personas (PersonaId union + typed definePersonas)
  personasFile: string

  // Personas metadata JSON
  personasMetaJsonFile: string

  // Variables
  variableTypesFile: string

  // Variables (typed wrapper for VariablesService)
  variablesFile: string

  // Variables metadata JSON
  variablesMetaJsonFile: string
}

export type PikkuCLIInput = {
  $schema?: string

  extends?: string

  rootDir: string
  /** Runtime artifacts directory (dev.db, content, tmp). Resolved relative to rootDir. Defaults to <rootDir>/.pikku-runtime. */
  runtimeDir?: string
  srcDirectories: string[]
  ignoreFiles?: string[]
  packageMappings: Record<string, string>
  addon?:
    | boolean
    | {
        categories?: string[]
        icon?: string
        displayName?: string
        description?: string
        serverlessIncompatible?: string[]
        openapi?: {
          version: string
          hash: string
        }
      }
  addonName?: string

  configDir: string
  tsconfig: string

  clientFiles?: {
    fetchFile?: string
    websocketFile?: string
    rpcWiringsFile?: string
    reactQueryFile?: string
    realtimeFile?: string
    /**
     * Optional import for the EventHubTopics type so the realtime client is
     * fully typed. Format: `<path>#<TypeName>` resolved relative to
     * `realtimeFile`. Example: `../types/eventhub-topics.js#EventHubTopics`.
     * If unset, the generated client treats topics as `Record<string, unknown>`.
     */
    realtimeEventHubTopicsImport?: string
    queueWiringsFile?: string
    mcpJsonFile?: string
    nextBackendFile?: string
    nextHTTPFile?: string
    /**
     * Transport used by the generated nextBackendFile wrapper.
     * - `'local'` (default): function code is loaded in-process via bootstrap +
     *   createSingletonServices. Required for Node/dev runs.
     * - `'worker-rpc'`: SSR dispatches every call through an injected `Fetcher`
     *   ({ fetch(req): Promise<Response> }). Function code is NOT bundled into
     *   the SSR worker. Pair with `nextBackendFetcherImport` to point at your
     *   resolver module.
     * - `'http'`: SSR dispatches every call through the generated `PikkuFetch`
     *   client. Use this when your Next app should call a separately running
     *   local/server API instead of importing function code in-process.
     */
    nextBackendTransport?: 'local' | 'worker-rpc' | 'http'
    /**
     * Module that exports a `fetcher: Fetcher` (or default export) used by the
     * worker-RPC variant of the next backend wrapper. Resolved relative to
     * `nextBackendFile`. Required when `nextBackendTransport === 'worker-rpc'`.
     */
    nextBackendFetcherImport?: string
    /**
     * Emit a TanStack Start server-function shim into this file. The shim
     * exports `makeApi(): PikkuRPC` — a typed caller over the generated RPC map
     * for use in Start loaders, actions and components. It reads the API base
     * URL from `import.meta.env.VITE_API_URL` (throws if unset). Requires
     * `rpcWiringsFile` (where the `PikkuRPC` class is generated).
     */
    tanstackStartFile?: string
    /**
     * Emit the browser-side scope client into this file: the project's
     * `ScopeId` union and a `hasScopes(required, held)` for deciding what a UI
     * renders. It has no imports, so a frontend never has to reach into
     * `@pikku/core` — a server package — to check a permission.
     */
    scopesFile?: string
  }

  /** Directory containing email templates, locales, partials, and theme.json. */
  emailTemplatesDir?: string

  /**
   * Path to write the generated Better Auth wiring file (auth.gen.ts).
   * The CLI inspects this file and its generated siblings (auth-secrets.gen.ts,
   * auth-middleware.gen.ts) explicitly, so they may sit outside srcDirectories.
   * Example: "src/auth.gen.ts"
   */
  authFile?: string

  /**
   * Path to write the generated typed `pikkuBetterAuth` re-export (auth.types.ts).
   * Defaults to `{outDir}/auth/auth.types.ts`. Re-exported from `#pikku` so
   * user code can `import { pikkuBetterAuth } from '#pikku'` with project-typed services.
   */
  authTypesFile?: string

  /**
   * Path to write the generated Better Auth metadata (auth-meta.gen.json) —
   * the enabled social providers and plugins the console SSO page reads via
   * getAuthProviders. Defaults to `{outDir}/auth/pikku-auth-meta.gen.json`.
   */
  authMetaJsonFile?: string

  openAPI?: {
    outputFile: string
    additionalInfo: OpenAPISpecInfo
  }

  schema?: {
    additionalProperties?: boolean
    supportsImportAttributes?: boolean
  }

  db?: {
    engine?: 'sqlite' | 'postgres'
    pgVersion?: number

    /**
     * The postgres schema the generated runtime migrations create their tables
     * in. Defaults to none, which lands them wherever `search_path` points.
     *
     * For a project that keeps everything in one namespace — `app`, say. Without
     * it `pikku db generate` emits unqualified `create table`, which against the
     * default `search_path` of `"$user", public` writes a second copy of every
     * runtime table into `public` alongside the ones already in `app`.
     *
     * Postgres only: sqlite has one schema to be in, and its `REFERENCES` clause
     * takes a bare table name, so qualified DDL does not compile there.
     */
    schema?: string

    /**
     * Schema whose qualifier is dropped from the generated Kysely types, so
     * `app.user` is queried as `selectFrom('user')` and typed as `User` rather
     * than `AppUser`. Usually the same value as `schema`. Tables in any other
     * schema stay fully qualified; where dropping the qualifier would collide
     * with another table, that table keeps it and the codegen warns (PKU485).
     *
     * Not implied by `schema`, because the key is what Kysely puts in the SQL:
     * set this only for a schema the connection's `search_path` resolves, or
     * every query compiles and then fails to find its table at runtime.
     */
    defaultSchema?: string

    /**
     * Postgres extensions the CLI's embedded PGlite databases must load — the
     * local dev database, and the shadow one every `db` command migrates to type
     * and diff a schema.
     *
     * A bare name is one of PGlite's bundled contrib extensions (`hstore`,
     * `citext`, `uuid_ossp`, …) and needs nothing installed. Anything else is a
     * package the project depends on, such as `@electric-sql/pglite-pgvector`.
     *
     * Needed even when the project runs against a Postgres server that already
     * has the extension: the shadow database is PGlite regardless, so a
     * `CREATE EXTENSION` in a migration fails there unless it is declared here.
     */
    pgliteExtensions?: string[]
  }

  cli?: {
    entrypoints?: Record<
      string,
      | string
      | { type: 'local'; path: string }
      | {
          type: 'channel'
          name?: string
          route?: string
          wirePath: string
          path?: string
        }
      | Array<
          | string
          | { type: 'local'; path: string }
          | {
              type: 'channel'
              name?: string
              route?: string
              wirePath: string
              path?: string
            }
        >
    >
  }

  workflows?: {
    orchestratorQueue?: string
    workerQueue?: string
  }

  /**
   * The targets a run can point at, by name. Not under `scenarios` — a scenario
   * suite is one thing that runs against an environment, and a persona is
   * another, so an environment belongs to neither of them.
   *
   * The actor secret comes from SCENARIO_ACTOR_SECRET, never from here.
   */
  environments?: Record<
    string,
    {
      apiUrl: string
      /** Actor sign-in path under apiUrl. Default: /auth/sign-in/actor */
      signInPath?: string
      /** Exposed-RPC prefix under apiUrl. Default: /rpc */
      rpcPath?: string
      /** Frontend base URL browser steps navigate against. Required for steps with a `browser` binding. */
      appUrl?: string
      /**
       * This environment carries real consequences, so only an `accountable`
       * persona may run against it.
       *
       * A flag rather than a reserved name: projects call it `prod`, `live` or
       * `eu-prod`, and more than one environment can be production.
       */
      production?: boolean
    }
  >

  scenarios?: {
    /**
     * The mail domain a persona's address is built on — `susan@…`.
     *
     * Real and deliverable, not a `.local` dead end: a persona that cannot read
     * its own mail cannot finish sign-up, a magic link, an invite or a password
     * reset, which is most of what is worth exercising. Defaults to a domain
     * nobody can own, so an app that never sends mail runs fine and one that
     * does fails at the first send rather than mailing a stranger.
     */
    emailDomain?: string
    /**
     * The package driving `browser` bindings. Anything exporting a
     * `ScenarioBrowserProvider` works — the runner never depends on a
     * particular browser tool. Defaults to `@pikku/playwright`.
     */
    browserDriver?: string
    /**
     * The model a persona thinks with — for `actor.converse(...)` and for
     * `pikku virtual-user run`. Its own turns, its approval decisions and its
     * closing verdict. Not the model under test: that one belongs to the agent
     * being conversed with, and the whole point of the exercise is that the two
     * are different. A step can override it per conversation; with neither set,
     * `converse` refuses rather than guessing.
     */
    model?: string
  }

  scaffold?: {
    addonDir?: string
    functionDir?: string
    wiringDir?: string
    middlewareDir?: string
    permissionDir?: string
    pikkuDir?: string
    /** Wire the pikku addon-graph package so pikkuWorkflowGraph can reference its native transforms like graph:editFields. */
    graph?: boolean
    rpc?: PikkuScaffoldFeature
    console?: PikkuScaffoldFeature
    scenarios?: PikkuScaffoldFeature
    /**
     * List, create, ban, delete, session-revocation and set-password functions
     * driving better-auth's internal adapter. Requires better-auth to be wired —
     * codegen fails if it is not — and banning additionally requires the ban()
     * plugin from @pikku/better-auth.
     */
    userAdmin?: PikkuScaffoldFeature
    /**
     * Start a virtual user against this application over RPC and read back what
     * it found — the same run `pikku persona run` does from a terminal, kept in
     * a `VirtualUserRunStore`. Requires at least one declared persona, since a
     * virtual user runs AS one; codegen fails if there are none.
     */
    virtualUser?: PikkuScaffoldFeature
    agent?: PikkuScaffoldFeature
    workflow?: PikkuScaffoldFeature
    events?: PikkuScaffoldFeature
    remoteRpc?: PikkuScaffoldFeature
    /**
     * The outgoing webhook delivery worker exposes no endpoint of its own and
     * has no output path to override — it is on or off.
     */
    webhook?: boolean
  }

  /**
   * Community-registry addons installed via `pikku fabric addon add`. The
   * source is copied into the project shadcn-style; each lands in
   * `<addonDir>/<name>/` and the dir is registered as a yarn workspace so
   * `wireAddon({ package })` resolves it by name. `addonDir` defaults to
   * `addons` (top-level, outside the app's TS scan). Install provenance is
   * tracked in pikku-addons.json.
   */
  addons?: {
    addonDir?: string
  }

  /**
   * Model aliases, e.g. `{ "cheap": "openai/gpt-5-mini" }`, so a declaration
   * can name a model by what it is for and one edit repoints every use.
   * Optional — a model containing `/` is used as written. A bare name that is
   * not in this table fails codegen.
   */
  models?: Record<string, string>

  tests?: {
    outputDir?: string
  }

  forceRequiredServices?: string[]

  schemasFromTypes?: string[]

  stateOutput?: string
  stateInput?: string

  /**
   * Run the data-classification security lint (scans function return types for
   * Private/Pii/Secret leaks). Off by default — it forces expensive return-type
   * inference on every function and is not part of codegen. Enable here to always
   * run it, or per-invocation via `pikku all --security`. Pair with
   * `failOnError` to gate a build/CI on leaks.
   */
  security?: boolean

  /**
   * After codegen, run a real `tsc --noEmit` over the project's tsconfig and
   * fail on type errors. `tsc` prints full diagnostics with code frames;
   * `tscSummary` prints a compact one-line-per-error render (no code frames,
   * capped) that's cheap for AI agents / CI logs. Off by default; enable per
   * invocation via `pikku all --tsc` / `--tsc-summary`.
   */
  tsc?: boolean
  tscSummary?: boolean

  /**
   * After a successful codegen run, emit a structural diff of the generated
   * `.pikku` meta (functions/wirings/workflows/emails added/removed/changed vs
   * the state before this run) as a `PIKKU_DIFF <json>` line on stdout. Only
   * emitted on exit 0. Off by default; enable per invocation via
   * `pikku all --diff`. Consumed by the sandbox "what changed" build card.
   */
  diff?: boolean

  lint?: {
    servicesNotDestructured?: 'off' | 'warn' | 'error'
    wiresNotDestructured?: 'off' | 'warn' | 'error'
    functionDynamicImport?: 'off' | 'warn' | 'error'
    /**
     * Flag a root `start`/`dev` script that boots a server without `pikku dev`
     * or `pikku serve`, since a hand-rolled entrypoint constructs its own
     * services and never runs the `pikkuServerLifecycle` hooks. Defaults to
     * 'warn'; set 'off' to keep a custom entrypoint. Unlike the rules above
     * this one is evaluated by `pikku validate`, not by codegen.
     */
    customServerBootstrap?: 'off' | 'warn' | 'error'
  }

  /**
   * Escape hatches, refused unless named here. Each trades something the
   * tooling can inspect for something only a person can read, so the project
   * decides once rather than each author at the call site.
   *
   * Unset means unavailable: using one is a build error naming the flag that
   * would permit it. Opting in is not a suppression — the diagnostics around
   * these still fire.
   */
  allow?: {
    /**
     * Permits `permissionsInBody: true` on a function config, the declaration
     * that a function gates its callers in its own body.
     */
    permissionsInBody?: boolean
    /**
     * Permits `pikkuWorkflowComplexFunc`, whose inline steps cannot be
     * serialized into the workflow graph — so they cannot be replayed,
     * migrated across a definition change, or shown in the console.
     */
    complexWorkflows?: boolean
  }

  addonMetaJsonFile?: string

  globalHTTPPrefix?: string

  binary?: {
    entrypoint: string
    output: string
    targets?: string[]
  }

  deploy?: {
    providers: Record<string, string>
    defaultProvider?: string
    serverlessIncompatible?: string[]
    /**
     * Default deploy target for functions that don't declare an explicit
     * `deploy` flag and don't use a serverless-incompatible service.
     * Defaults to 'serverless'.
     */
    defaultTarget?: 'serverless' | 'server'
  }

  /** Named filter presets keyed by name, used via CLI --filter <name>. */
  namedFilters?: Record<string, InspectorFilters>

  filters: InspectorFilters
} & PikkuCLICoreOutputFiles

export type PikkuCLIConfig = PikkuCLIInput & {
  configFile?: string
  tags?: string[]
  wires?: string[]
  excludeWires?: string[]

  userSessionType?: string
  singletonServicesFactoryType?: string
  wireServicesFactoryType?: string
}
