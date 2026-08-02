import type * as ts from 'typescript'
import type { SecretUsage } from './utils/extract-secret-usage.js'
import type { ChannelMessageMeta, ChannelsMeta } from '@pikku/core/channel'
import type { GatewaysMeta } from '@pikku/core/gateway'
import type { HTTPWiringsMeta } from '@pikku/core/http'
import type { ScheduledTasksMeta } from '@pikku/core/scheduler'
import type { TriggerMeta, TriggerSourceMeta } from '@pikku/core/trigger'
import type { QueueWorkersMeta } from '@pikku/core/queue'
import type { WorkflowsMeta } from '@pikku/core/workflow'
import type {
  MCPResourceMeta,
  MCPToolMeta,
  MCPPromptMeta,
} from '@pikku/core/mcp'
import type { AIAgentMeta } from '@pikku/core/ai-agent'
import type { CLIMeta } from '@pikku/core/cli'
import type { CLICommandMeta } from '@pikku/core/cli'
import type { NodesMeta } from '@pikku/core/node'
import type { SecretDefinitions } from '@pikku/core/secret'
import type { CredentialDefinitions } from '@pikku/core/credential'
import type { ScopeDefinitions } from '@pikku/core/scope'
import type { SystemRoleDefinitions } from '@pikku/core/role'
import type { PersonaDefinitions } from '@pikku/core/persona'
import type { VariableDefinitions } from '@pikku/core/variable'
import type { TypesMap } from './types-map.js'
import type {
  FunctionsMeta,
  FunctionServicesMeta,
  FunctionWiresMeta,
  JSONValue,
} from '@pikku/core'
import type { OpenAPISpecInfo } from './utils/serialize-openapi-json.js'
import type { ErrorCode, CodedDiagnostic } from './error-codes.js'
import type {
  VersionManifest,
  VersionValidateError,
} from './utils/contract-hashes.js'
import type { SerializedWorkflowGraphs } from './utils/workflow/graph/workflow-graph.types.js'

export type PathToNameAndType = Map<
  string,
  { variable: string; type: string | null; typePath: string | null }[]
>

export type MetaInputTypes = Map<
  string,
  {
    query: string[] | undefined
    params: string[] | undefined
    body: string[] | undefined
  }
>

/** One `addHTTPMiddleware`/`addTagMiddleware`/`addChannelMiddleware` call. */
export interface MiddlewareRegistration {
  exportName: string | null // null if not exported
  sourceFile: string
  position: number
  isFactory: boolean // true if wrapped in () => add...()
}

export interface MiddlewareGroupMeta extends MiddlewareRegistration {
  services: FunctionServicesMeta
  count: number
  instanceIds: string[]
  /**
   * The registrations after the first, when several files add middleware for
   * the same pattern or tag.
   *
   * A group is keyed by its pattern/tag, so without this a second file's call
   * overwrote the first's and only the survivor got an import emitted into
   * pikku-middleware.gen.ts — the losing file was never imported, so its
   * registration never ran. The runtime composes repeated registrations for a
   * pattern happily; only codegen dropped one, which is how an app could lose
   * its session-bridge middleware to an unrelated `'*'` group and see nothing
   * go wrong until a request arrived without a session.
   */
  additionalRegistrations?: MiddlewareRegistration[]
}

export interface InspectorHTTPState {
  metaInputTypes: MetaInputTypes
  meta: HTTPWiringsMeta
  files: Set<string>
  // HTTP middleware calls tracking - route pattern -> group metadata
  // Pattern '*' matches all routes (from addHTTPMiddleware('*', [...]))
  // Pattern '/api/*' matches specific routes (from addHTTPMiddleware('/api/*', [...]))
  routeMiddleware: Map<string, MiddlewareGroupMeta>
}

/**
 * Schema vendor types for Standard Schema compliant validators
 */
export type SchemaVendor = 'zod' | 'valibot' | 'arktype' | 'effect' | 'unknown'

/**
 * Schema reference for deferred conversion to JSON Schema at build time.
 * Supports Standard Schema compliant validators (Zod, Valibot, ArkType, Effect Schema).
 */
export interface SchemaRef {
  variableName: string
  sourceFile: string
  vendor?: SchemaVendor
}

export interface InspectorFunctionState {
  typesMap: TypesMap
  meta: FunctionsMeta
  files: Map<string, { path: string; exportedName: string }>
  approvalDescriptions: Record<string, InspectorApprovalDescriptionDefinition>
  /**
   * pikkuFuncIds whose handler body performs a runtime dynamic `import(...)`.
   * Transient lint signal consumed by computeDiagnostics (PKU498) in the same
   * inspection pass — deliberately not part of the serialized function meta.
   */
  dynamicImportIds: Set<string>
}

export interface InspectorChannelState {
  meta: ChannelsMeta
  files: Set<string>
}

export interface ExportedHTTPRouteFunctionMeta {
  pikkuFuncId: string
  packageName?: string
}

export interface ExportedHTTPRouteConfigMeta {
  method: string
  route: string
  func: ExportedHTTPRouteFunctionMeta
  auth?: boolean
  tags?: string[]
  sse?: boolean
  contentType?: string
  timeout?: number
  headers?: Record<string, string>
}

export interface ExportedHTTPRoutesGroupMeta {
  basePath?: string
  tags?: string[]
  auth?: boolean
  routes: ExportedHTTPRouteMapMeta
}

export type ExportedHTTPRouteEntryMeta =
  | ExportedHTTPRouteConfigMeta
  | ExportedHTTPRoutesGroupMeta
  | ExportedHTTPRouteMapMeta

export interface ExportedHTTPRouteMapMeta {
  [key: string]: ExportedHTTPRouteEntryMeta
}

export type ExportedHTTPContractsMeta = Record<
  string,
  ExportedHTTPRoutesGroupMeta
>

export interface ExportedChannelRouteMeta extends ChannelMessageMeta {
  auth?: boolean
}

export type ExportedChannelContractsMeta = Record<
  string,
  Record<string, ExportedChannelRouteMeta>
>

export type ExportedCLIContractsMeta = Record<
  string,
  Record<string, CLICommandMeta>
>

export interface InspectorExportedContractsState {
  http: ExportedHTTPContractsMeta
  cli: ExportedCLIContractsMeta
  channel: ExportedChannelContractsMeta
  addonHttp: Record<string, ExportedHTTPContractsMeta>
  addonCli: Record<string, ExportedCLIContractsMeta>
  addonChannel: Record<string, ExportedChannelContractsMeta>
}

export interface InspectorMiddlewareDefinition {
  services: FunctionServicesMeta
  wires?: FunctionWiresMeta
  sourceFile: string
  position: number
  exportedName: string | null
  factory?: boolean
  name?: string
  description?: string
  package?: string
}

export interface InspectorMiddlewareInstance {
  definitionId: string
  sourceFile: string
  position: number
  isFactoryCall: boolean
}

export interface InspectorMiddlewareState {
  definitions: Record<string, InspectorMiddlewareDefinition>
  instances: Record<string, InspectorMiddlewareInstance>
  tagMiddleware: Map<string, MiddlewareGroupMeta>
}

export interface InspectorChannelMiddlewareState {
  definitions: Record<string, InspectorMiddlewareDefinition>
  instances: Record<string, InspectorMiddlewareInstance>
  tagMiddleware: Map<string, MiddlewareGroupMeta>
}

export interface InspectorAIMiddlewareState {
  definitions: Record<string, InspectorMiddlewareDefinition>
}

export interface InspectorApprovalDescriptionDefinition {
  services: FunctionServicesMeta
  wires?: FunctionWiresMeta
  sourceFile: string
  position: number
  exportedName: string | null
}

export interface InspectorPermissionDefinition {
  services: FunctionServicesMeta
  wires?: FunctionWiresMeta
  sourceFile: string
  position: number
  exportedName: string | null
  factory?: boolean
  name?: string
  description?: string
  package?: string
  requiresData?: boolean
}

export interface InspectorPermissionInstance {
  definitionId: string
  sourceFile: string
  position: number
  isFactoryCall: boolean
}

export interface InspectorPermissionState {
  definitions: Record<string, InspectorPermissionDefinition>
  instances: Record<string, InspectorPermissionInstance>
}

export type InspectorFilters = {
  names?: string[] // Wildcard support: "email-*" matches "email-worker", "email-sender"
  tags?: string[]
  wires?: string[]
  directories?: string[]
  httpRoutes?: string[] // HTTP route patterns: "/api/*", "/webhooks/*"
  httpMethods?: string[] // HTTP methods: "GET", "POST", "DELETE", etc.

  excludeNames?: string[]
  excludeTags?: string[]
  excludeWires?: string[]
  excludeDirectories?: string[]
  excludeHttpRoutes?: string[]
  excludeHttpMethods?: string[]

  // Keep only functions whose effective deploy target is in this list.
  // A function's effective target is its explicit `deploy` field, or
  // 'server' if any of its services are listed in `serverlessIncompatible`,
  // otherwise 'serverless'.
  target?: Array<'serverless' | 'server'>
  excludeTarget?: Array<'serverless' | 'server'>
  // Service names that, when consumed by a function, force its target
  // to 'server'. Sourced from `pikku.config.json` →
  // `deploy.serverlessIncompatible`. Used only when deploy filters are set.
  serverlessIncompatible?: string[]
  // Default deploy target for functions without an explicit `deploy` flag.
  // Sourced from `pikku.config.json` → `deploy.defaultTarget`. Used only
  // when deploy filters are set. Defaults to 'serverless'.
  defaultTarget?: 'serverless' | 'server'
}

export type AddonConfig = {
  package: string
  rpcEndpoint?: string
  secretOverrides?: Record<string, string>
  forceInclude?: boolean
}

export type InspectorOptions = Partial<{
  setupOnly: boolean
  rootDir: string
  isAddon: boolean
  /**
   * Fail the build on metadata that only an agent needs — currently an agent
   * tool with no description. Off by default: the runtime falls back to the
   * tool's own name, so this is a quality gate rather than a correctness one.
   */
  strictMeta: boolean
  sourceFile: ts.SourceFile
  /**
   * The project's tsconfig, read for its path mappings only. The inspector's
   * program needs them to resolve imports the project reaches through `paths`;
   * unlike `schemaConfig.tsconfig` this is also needed on a setup-only run.
   */
  tsconfig: string
  types: Partial<{
    configFileType: string
    userSessionType: string
    singletonServicesFactoryType: string
    wireServicesFactoryType: string
  }>
  schemaConfig: {
    tsconfig: string
    schemasFromTypes?: string[]
    schema?: { additionalProperties?: boolean }
    /**
     * Directory for the on-disk TS-schema cache. When set, generated TS schemas
     * are persisted here keyed by a hash of the custom-types content, so a warm
     * `pikku all` whose function types are unchanged skips ts-json-schema-generator
     * entirely (the single largest cold-run cost). Omit to disable disk caching.
     */
    cacheDir?: string
  }
  openAPI: {
    additionalInfo: OpenAPISpecInfo
  }
  tags: string[]
  manifest: VersionManifest
  oldProgram: ts.Program | undefined
  /**
   * Run the data-classification leak scan (Private/Pii/Secret brands in function
   * return types). Off by default — it forces return-type inference on every
   * function, which is expensive. Enabled via `pikku all --security`.
   */
  classificationCheck: boolean
}>

export interface InspectorLogger {
  info: (message: string) => void
  error: (message: string) => void
  warn: (message: string) => void
  debug: (message: string) => void
  /**
   * Emit a tracked, coded diagnostic. It is recorded and printed; `error`/`warn`
   * only block the build when the CLI is run with `--fail-on-error` /
   * `--fail-on-warn` (default: critical only). Use this for issues worth
   * surfacing (e.g. data-classification leaks) that should not stop the dev
   * server from starting.
   */
  diagnostic: (diagnostic: CodedDiagnostic) => void
  /** Sugar for `diagnostic({ severity: 'critical', code, message })`. */
  critical: (code: ErrorCode, message: string) => void
  hasCriticalErrors: () => boolean
}

export type AddWiring = (
  logger: InspectorLogger,
  node: ts.Node,
  checker: ts.TypeChecker,
  state: InspectorState,
  options: InspectorOptions
) => void
export interface InspectorFilesAndMethods {
  userSessionType?: {
    file: string
    variable: string
    type: string
    typePath: string
  }
  wireServicesType?: {
    file: string
    variable: string
    type: string
    typePath: string
  }
  singletonServicesType?: {
    file: string
    variable: string
    type: string
    typePath: string
  }
  pikkuConfigType?: {
    file: string
    variable: string
    type: string
    typePath: string
  }
  pikkuConfigFactory?: {
    file: string
    variable: string
    type: string
    typePath: string
  }
  singletonServicesFactory?: {
    file: string
    variable: string
    type: string
    typePath: string
  }
  wireServicesFactory?: {
    file: string
    variable: string
    type: string
    typePath: string
  }
  serverLifecycleFactory?: {
    file: string
    variable: string
    type: string
    typePath: string
  }
}

export interface InspectorDiagnostic {
  code: string
  message: string
  sourceFile: string
  position: number
}

/** A single discovered `export const X = pikkuBetterAuth((services) => betterAuth({...}))`. */
export interface AuthDefinition {
  /** The exported binding name the CLI imports (`export const <exportName>`). */
  exportName: string
  /** Absolute path of the file declaring it. */
  sourceFile: string
  /** better-auth base path (the `basePath` option, default `/api/auth`). */
  basePath: string
  /** Whether email/password auth is enabled (`emailAndPassword.enabled`). Written
   *  into the generated `auth-meta.gen.json` so the console knows credentials are
   *  available alongside the OAuth providers. */
  hasCredentials: boolean
  /** better-auth plugin ids used in the config's `plugins: [...]` array, read
   *  from each entry's callee name (e.g. `bearer()` → `'bearer'`). Written into
   *  `auth-meta.gen.json` so the console SSO page can show which plugins are
   *  enabled. */
  plugins: string[]
  /** Whether `session.cookieCache` is enabled — drives the stateless session
   * middleware split in the auth codegen. Absent/false ⇒ stateful middleware. */
  cookieCache?: boolean
  /**
   * Singleton services the generated auth handler must have available at
   * runtime — the services the `pikkuBetterAuth` factory reaches for (either
   * destructured from its first param, or accessed as `services.<name>` in its
   * body). better-auth's factory typically touches `secrets` and the DB.
   *
   * The generated `authHandler` calls `createAuthHandler(...).func`, an opaque
   * property access the inspector can't see through; without this stamp the
   * deployed auth worker would instantiate none of these services and the
   * factory would receive an undefined `kysely`. Re-derived every inspect and
   * applied to the handler meta before service aggregation runs.
   */
  services: FunctionServicesMeta
}

/** One statically resolved entry of a feature's `scenarios` array. */
export interface InspectorFeatureEntry {
  /** The scenario's declared export name, with any import alias followed back. */
  scenario: string
  /** A `{ scenario, data }` entry's literal data — gherkin's `Examples:`. */
  data?: unknown
}

/** A `pikkuFeature` export, as far as it can be read from the source. */
export interface InspectorFeature {
  path: string
  exportedName: string
  name?: string
  description?: string
  tags?: string[]
  entries: InspectorFeatureEntry[]
  /**
   * Entries that are not literal — a spread, a `.map()`, a call. Counted rather
   * than dropped so the console can say the listing is partial instead of
   * quietly showing a short feature.
   */
  unresolvedEntries: number
  /**
   * Feature hooks run once around the whole group, never per scenario, and are
   * runtime-only — so only their presence is recorded.
   */
  hasBefore: boolean
  hasAfter: boolean
}

export interface InspectorState {
  rootDir: string // Root directory inferred from source files
  singletonServicesTypeImportMap: PathToNameAndType
  wireServicesTypeImportMap: PathToNameAndType
  userSessionTypeImportMap: PathToNameAndType
  configTypeImportMap: PathToNameAndType
  singletonServicesFactories: PathToNameAndType
  wireServicesFactories: PathToNameAndType
  wireServicesMeta: Map<string, string[]> // variable name -> singleton services consumed
  addonRequiredParentServices: string[] // services an addon needs from the parent (extracted from pikkuAddonServices 2nd param)
  addonServerlessIncompatible: Map<string, string[]> // namespace → service names that are serverless-incompatible (scoped per addon)
  configFactories: PathToNameAndType
  serverLifecycleFactories: PathToNameAndType
  filesAndMethods: InspectorFilesAndMethods
  filesAndMethodsErrors: Map<string, PathToNameAndType>
  typesLookup: Map<string, ts.Type[]> // Lookup for types by name (e.g., function input types, Config type)
  schemaLookup: Map<string, SchemaRef> // Lookup for schemas by name for deferred JSON Schema conversion (supports Standard Schema vendors)
  schemas: Record<string, JSONValue>
  http: InspectorHTTPState
  functions: InspectorFunctionState
  channels: InspectorChannelState
  gateways: {
    meta: GatewaysMeta
    files: Set<string>
  }
  triggers: {
    meta: TriggerMeta
    sourceMeta: TriggerSourceMeta
    files: Set<string>
  }
  scheduledTasks: {
    meta: ScheduledTasksMeta
    files: Set<string>
  }
  queueWorkers: {
    meta: QueueWorkersMeta
    files: Set<string>
  }
  workflows: {
    meta: WorkflowsMeta
    files: Map<string, { path: string; exportedName: string }>
    graphMeta: SerializedWorkflowGraphs
    graphFiles: Map<string, { path: string; exportedName: string }>
    /**
     * `pikkuFeature` exports, keyed by export identifier.
     *
     * Everything the config states literally is extracted here, because a
     * feature is the document structure the console renders. Entries built by
     * an ordinary loop cannot be enumerated statically — those are counted in
     * `unresolvedEntries` and resolved at runtime by object identity instead.
     */
    featureFiles: Map<string, InspectorFeature>
    invokedWorkflows: Set<string>
  }
  rpc: {
    internalMeta: Record<string, string>
    internalFiles: Map<string, { path: string; exportedName: string }>
    exposedMeta: Record<string, string>
    exposedFiles: Map<string, { path: string; exportedName: string }>
    /** Functions marked `remote: true` — the surface a wireRemoteAddon consumer imports */
    remoteMeta: Record<string, string>
    remoteFiles: Map<string, { path: string; exportedName: string }>
    invokedFunctions: Set<string>
    invokedFunctionsByFile: Map<string, Set<string>>
    usedAddons: Set<string>
    wireAddonDeclarations: Map<
      string,
      {
        package: string
        rpcEndpoint?: string
        mcp?: boolean
        /**
         * The addon's own gates. `runPikkuFunc` applies these to every function
         * in the package, on every wiring path — not just `namespace:function`.
         * Absent when the declared value was not a statically-knowable literal,
         * which must be read as "unknown", never as "ungated".
         */
        auth?: boolean
        tags?: string[]
        scopes?: string[]
        /** True when declared via `wireRemoteAddon` — import the addon's `.remote.gen` map, not `.internal.gen` */
        remote?: boolean
        /** wireRemoteAddon: whether an `auth` binding was supplied (vs a public surface) */
        hasAuth?: boolean
        /** wireRemoteAddon: statically-known `auth.credentialId`, for verify */
        authCredentialId?: string
        /** wireRemoteAddon: statically-known `auth.secretId`, for verify */
        authSecretId?: string
        secretOverrides?: Record<string, string>
        variableOverrides?: Record<string, string>
        credentialOverrides?: Record<string, string>
      }
    >
    wireAddonFiles: Set<string>
  }
  mcpEndpoints: {
    resourcesMeta: MCPResourceMeta
    toolsMeta: MCPToolMeta
    promptsMeta: MCPPromptMeta
    files: Set<string>
  }
  agents: {
    agentsMeta: AIAgentMeta
    files: Map<string, { path: string; exportedName: string }>
  }
  cli: {
    meta: CLIMeta
    files: Set<string>
  }
  nodes: {
    meta: NodesMeta
    files: Set<string>
  }
  auth: {
    providers: string[]
    plugins: string[]
    files: Set<string>
    /** The single `export const X = pikkuBetterAuth({...})` discovered in the
     *  codebase, if any. The CLI generates the `/auth/*` HTTP wiring from it.
     *  More than one `pikkuBetterAuth` is a critical error. */
    definition: AuthDefinition | null
    /** True when a user (non-generated) file already registers
     *  `betterAuthStatelessSession(...)`. The CLI then skips auto-generating its
     *  own default-map stateless middleware, which would otherwise pre-empt the
     *  user's custom mapSession (pikkujs/pikku#754). */
    userStatelessSession?: boolean
    /** True when a user (non-generated) file already registers a global
     *  `betterAuthSession(...)`. The CLI then skips auto-generating its own
     *  default stateful middleware, which would otherwise run first and pre-empt
     *  the user's config (mapSession/impersonation/apiKey). Stateful analogue of
     *  `userStatelessSession`. */
    hasUserSessionMiddleware?: boolean
  }
  secrets: {
    definitions: SecretDefinitions
    files: Set<string>
    /** Secret reads found per source file, keyed by absolute path. */
    usage: Map<string, SecretUsage>
  }
  credentials: {
    definitions: CredentialDefinitions
    files: Set<string>
  }
  scopes: {
    definitions: ScopeDefinitions
    files: Set<string>
  }
  systemRoles: {
    definitions: SystemRoleDefinitions
    files: Set<string>
  }
  personas: {
    definitions: PersonaDefinitions
    files: Set<string>
  }
  variables: {
    definitions: VariableDefinitions
    files: Set<string>
  }
  manifest: {
    initial: VersionManifest | null
    current: VersionManifest | null
    errors: VersionValidateError[]
  }
  middleware: InspectorMiddlewareState
  channelMiddleware: InspectorChannelMiddlewareState
  aiMiddleware: InspectorAIMiddlewareState
  permissions: InspectorPermissionState
  serviceAggregation: {
    requiredServices: Set<string>
    usedFunctions: Set<string>
    usedMiddleware: Set<string>
    usedPermissions: Set<string>
    allSingletonServices: string[]
    allWireServices: string[]
  }
  resolvedIOTypes: Record<string, { inputType: string; outputType: string }>
  middlewareGroupsMeta: {
    definitions: Record<string, InspectorMiddlewareDefinition>
    instances: Record<string, InspectorMiddlewareInstance>
    httpGroups: Record<string, MiddlewareGroupMeta>
    tagGroups: Record<string, MiddlewareGroupMeta>
    channelMiddleware: {
      definitions: Record<string, InspectorMiddlewareDefinition>
      instances: Record<string, InspectorMiddlewareInstance>
      tagGroups: Record<string, MiddlewareGroupMeta>
    }
  }
  permissionsGroupsMeta: {
    definitions: Record<string, InspectorPermissionDefinition>
  }
  requiredSchemas: Set<string>
  openAPISpec: Record<string, any> | null
  diagnostics: InspectorDiagnostic[]
  addonFunctions: Record<string, FunctionsMeta> // namespace -> addon's function metadata
  exportedContracts: InspectorExportedContractsState
  program: ts.Program | null // Retained for incremental re-inspection
}
