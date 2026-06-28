import type { InspectorFilters } from '@pikku/inspector'
import type { OpenAPISpecInfo } from '@pikku/inspector'
import { PikkuWiringTypes } from '@pikku/core'

export type PikkuScaffoldFeature = 'auth' | 'no-auth' | false

export interface PikkuCLICoreOutputFiles {
  // Base directory
  outDir: string

  // Schema and types
  schemaDirectory: string
  typesDeclarationFile: string

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

  // Remote RPC workers (derived from scaffold.pikkuDir when scaffold.remoteRpc is enabled).
  // Optional: left undefined when scaffold.remoteRpc is not enabled, so consumers must guard.
  remoteRpcWorkersFile?: string

  // Feature-generated files (derived from scaffold.pikkuDir when enabled)
  publicRpcFile: string
  publicAgentFile: string
  consoleFunctionsFile: string
  workflowRoutesFile: string
  eventsChannelFile: string

  // Triggers
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
  workflowTypesFile: string
  workflowMetaDir: string

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

  // Permissions
  permissionsFile: string
  permissionsGroupsMetaJsonFile: string

  // Application bootstrap
  bootstrapFile: string

  // Package service factories (for addon packages)
  packageFile: string

  // Addon types (pikkuAddonConfig, pikkuAddonServices, etc.)
  addonTypesFile: string

  // Node
  nodeTypesFile: string

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
    startServerFnsFile?: string
  }

  /** Directory containing email templates, locales, partials, and theme.json. */
  emailTemplatesDir?: string

  /**
   * Path to write the generated Better Auth wiring file (auth.gen.ts).
   * Must be within srcDirectories so wireSecret calls are picked up by the inspector.
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

  scaffold?: {
    addonDir?: string
    functionDir?: string
    wiringDir?: string
    middlewareDir?: string
    permissionDir?: string
    pikkuDir?: string
    rpc?: PikkuScaffoldFeature
    console?: PikkuScaffoldFeature
    agent?: PikkuScaffoldFeature
    workflow?: PikkuScaffoldFeature
    events?: PikkuScaffoldFeature
    remoteRpc?: PikkuScaffoldFeature
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

  tests?: {
    outputDir?: string
  }

  forceRequiredServices?: string[]

  schemasFromTypes?: string[]

  stateOutput?: string
  stateInput?: string

  verboseMeta?: boolean

  /**
   * Run the data-classification security lint (scans function return types for
   * Private/Pii/Secret leaks). Off by default — it forces expensive return-type
   * inference on every function and is not part of codegen. Enable here to always
   * run it, or per-invocation via `pikku all --security`. Pair with
   * `failOnError` to gate a build/CI on leaks.
   */
  security?: boolean

  lint?: {
    servicesNotDestructured?: 'off' | 'warn' | 'error'
    wiresNotDestructured?: 'off' | 'warn' | 'error'
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
