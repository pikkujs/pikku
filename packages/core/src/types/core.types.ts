import type { Logger, LogLevel } from '../services/logger.js'
import type { VariablesService } from '../services/variables-service.js'
import type { SecretService } from '../services/secret-service.js'
import type { SchemaService } from '../services/schema-service.js'
import type { JWTService } from '../services/jwt-service.js'
import type { PikkuHTTP } from '../wirings/http/http.types.js'
import type {
  PikkuChannel,
  CorePikkuChannelMiddleware,
  CorePikkuChannelMiddlewareFactory,
} from '../wirings/channel/channel.types.js'
import type { EventHubService } from '../wirings/channel/eventhub-service.js'
import type { PikkuRPC } from '../wirings/rpc/rpc-types.js'
import type { PikkuMCP } from '../wirings/mcp/mcp.types.js'
import type { PikkuScheduledTask } from '../wirings/scheduler/scheduler.types.js'
import type { PikkuQueue, QueueService } from '../wirings/queue/queue.types.js'
import type { PikkuCLI } from '../wirings/cli/cli.types.js'
import type {
  PikkuWorkflowWire,
  PikkuScenarioWire,
  WorkflowService,
  WorkflowServiceConfig,
  WorkflowStepWire,
} from '../wirings/workflow/workflow.types.js'
import type {
  PikkuBrowserWire,
  PikkuScenarioStepWire,
  ScenarioStepKind,
  ScenarioSurface,
} from '../wirings/workflow/scenario-step.types.js'
import type { PikkuGraphWire } from '../wirings/workflow/graph/workflow-graph.types.js'
import type { PikkuTrigger } from '../wirings/trigger/trigger.types.js'
import type { PikkuGateway } from '../wirings/gateway/gateway.types.js'
import type { SchedulerService } from '../services/scheduler-service.js'
import type { DeploymentService } from '../services/deployment-service.js'
import type { AIStorageService } from '../services/ai-storage-service.js'

import type { ContentService } from '../services/content-service.js'
import type {
  ScenarioPersonaOf,
  ScenarioPersonas,
} from '../services/personas-service.js'
import type { AIAgentRunnerService } from '../services/ai-agent-runner-service.js'
import type { AIEmbeddingService } from '../services/ai-embedding-service.js'
import type { AIRunStateService } from '../services/ai-run-state-service.js'
import type { AgentRunService } from '../wirings/ai-agent/ai-agent.types.js'
import type { PikkuAIMiddlewareHooks } from '../wirings/ai-agent/ai-agent.types.js'
import type { WorkflowRunService } from '../wirings/workflow/workflow.types.js'
import type { CredentialService } from '../services/credential-service.js'
import type { EmailService } from '../services/email-service.js'
import type {
  WebhookService,
  WebhookServiceConfig,
} from '../services/webhook-service.js'
import type { MetaService } from '../services/meta-service.js'
import type { CoverageService } from '../services/v8-coverage-service.js'
import type { SessionStore } from '../services/session-store.js'
import type { ScopeService } from '../services/scope-service.js'
import type {
  AuditDurability,
  AuditLog,
  AuditService,
} from '../services/audit-service.js'

export type PikkuWiringTypes =
  | 'http'
  | 'scheduler'
  | 'trigger'
  | 'channel'
  | 'rpc'
  | 'queue'
  | 'mcp'
  | 'cli'
  | 'workflow'
  | 'agent'
  | 'gateway'

export interface FunctionServicesMeta {
  optimized: boolean
  services: string[]
}

export interface FunctionWiresMeta {
  optimized: boolean
  wires: string[]
}

export type MiddlewareMetadata =
  | {
      type: 'http'
      route: string // Route pattern (e.g., '*' for all, '/api/*' for specific)
    }
  | {
      type: 'tag'
      tag: string
    }
  | {
      type: 'wire'
      name: string
      inline?: boolean
    }

/**
 * A reference to a permission function, resolved by name. Function-scoped
 * only: there are no wire- or tag-level permission references.
 */
export type PermissionMetadata = {
  type: 'wire'
  name: string
  inline?: boolean
}

export type FunctionRuntimeMeta = {
  pikkuFuncId: string
  inputSchemaName: string | null
  outputSchemaName: string | null
  /** Scopes the session must hold to run this function. All are required (AND). */
  scopes?: string[]
  expose?: boolean
  remote?: boolean
  /**
   * A step RPC: invoked by name only from a scenario run and refused
   * everywhere else, so it is never network-callable.
   */
  scenarioStep?: boolean
  /**
   * The body of a `pikkuScenario(...)`. Only ever run by `pikku scenario run`,
   * so it is held back from the app bootstrap and from every deployed unit.
   */
  scenario?: boolean
  mcp?: boolean
  readonly?: boolean
  deploy?: 'serverless' | 'server' | 'auto'
  sessionless?: boolean
  /** When true, workflow steps calling this function are dispatched via the queue. No queue service configured is a hard error. */
  workflowQueued?: boolean
  /** Retry count when this function is used as a workflow step. */
  workflowRetries?: number
  /** Timeout when this function is used as a workflow step (e.g. '30s', '5m'). */
  workflowTimeout?: string
  /**
   * Scenario steps only: which surfaces this step declares a binding for.
   *
   * The reporter derives coverage from this — a `then` with no binding for the
   * surface the run targeted was never actually witnessed there, which is a gap
   * worth counting rather than excusing.
   */
  scenarioStepSurfaces?: ScenarioSurface[]
  /**
   * Scenario steps only: who acts. Absent means `persona` — the ordinary step,
   * and the only kind that existed before the other two.
   *
   * A `platform` or `addon` step is the app or a third-party system acting, and
   * it must never reach a virtual user's catalogue. That is not tidiness: a
   * virtual user that can invoke "Stripe's webhook arrives" can forge its own
   * payment success, and every finding downstream of that is worthless.
   */
  scenarioStepKind?: ScenarioStepKind
  /** Addon steps only: the addon whose system acts — `wireAddon`'s `name`. */
  scenarioStepAddon?: string
  /** Scenario steps only: the prose a reporter renders, with `{placeholders}` filled from the step's recorded input. */
  scenarioStepTemplate?: string
  version?: number
  approvalRequired?: boolean
  approvalDescription?: string
  implementationHash?: string
  contractHash?: string
  inputHash?: string
  outputHash?: string
}

export type FunctionMeta = FunctionRuntimeMeta &
  Partial<
    {
      name: string
      /** `remote`: a contract with no local body, answered by a connected client. */
      functionType: 'user' | 'inline' | 'helper' | 'remote'
      funcWrapper: string
      services: FunctionServicesMeta
      wires: FunctionWiresMeta
      inputs: string[] | null
      outputs: string[] | null
      middleware: MiddlewareMetadata[]
      permissions: PermissionMetadata[]
      isDirectFunction: boolean
      sourceFile: string
      exportedName: string
      /** File containing the handler body when it differs from sourceFile (imported handlers) */
      bodySourceFile?: string
      /** 1-indexed first line of the handler body (verbose meta; coverage mapping) */
      bodyStart: number
      /** 1-indexed last line of the handler body (verbose meta; coverage mapping) */
      bodyEnd: number
    } & CommonWireMeta
  >

export type FunctionsRuntimeMeta = Record<string, FunctionRuntimeMeta>
export type FunctionsMeta = Record<string, FunctionMeta>

export type MakeRequired<T, K extends keyof T> = Omit<T, K> &
  Required<Pick<T, K>>

export type JSONPrimitive = string | number | boolean | null | undefined

export type JSONValue =
  | JSONPrimitive
  | JSONValue[]
  | {
      [key: string]: JSONValue
    }

export type PickRequired<T, K extends keyof T> = T & Required<Pick<T, K>>

export type PickOptional<T, K extends keyof T> = Partial<T> & Pick<T, K>

export type RequireAtLeastOne<T> = {
  [K in keyof T]-?: Required<Pick<T, K>> & Partial<Pick<T, Exclude<keyof T, K>>>
}[keyof T]

/**
 * Runtime pool tuning for the Postgres adapter. The connection string stays
 * the flat `postgresUrl` config field — the contract the CLI's db commands read.
 */
export interface PostgresConfig {
  /** Max connections in the postgres.js pool. Defaults to postgres.js's 10. */
  maxPool?: number
  /** Seconds to wait establishing a new connection before failing. */
  connectTimeout?: number
  /** Close a pooled connection after it has been idle this many seconds. */
  idleTimeout?: number
  /**
   * Recycle a connection after this many seconds. Guards against stale TCP
   * connections silently dropped by load balancers / proxies.
   */
  maxLifetime?: number
  /**
   * Server-side `statement_timeout` in milliseconds. A query running longer is
   * cancelled, freeing its connection — defense against a runaway query pinning
   * a pooled connection and exhausting the pool.
   */
  statementTimeout?: number
  /**
   * Set `false` behind a transaction-mode connection pooler (pgBouncer,
   * Supabase pooler) that cannot use prepared statements.
   */
  prepare?: boolean
}

export type CoreConfig<Config extends Record<string, unknown> = {}> = {
  logLevel?: LogLevel
  secrets?: {}

  workflow?: WorkflowServiceConfig
  webhook?: WebhookServiceConfig
  postgres?: PostgresConfig
} & Config

export interface CoreUserSession {
  userId?: string
  orgId?: string
  /** True when the session belongs to a synthetic scenario actor — lets audits/analytics address synthetic traffic */
  actor?: boolean
  /**
   * Scopes granted to this session, checked against a function's `scopes`.
   * Populated by whoever builds the session — core reads them, never fetches.
   */
  scopes?: string[]
}

/**
 * Kept structural so core stays independent of any one auth package —
 * `@pikku/better-auth`'s `BetterAuthInstance` satisfies it.
 */
export interface AuthInstance {
  handler: (request: Request) => Promise<Response>
  api: Record<string, any>
  $context?: Promise<any>
}

export interface CoreSingletonServices<Config extends CoreConfig = CoreConfig> {
  schema?: SchemaService
  jwt?: JWTService
  config: Config
  logger: Logger
  variables: VariablesService
  secrets: SecretService
  workflowService?: WorkflowService
  queueService?: QueueService
  eventHub?: EventHubService<Record<string, any>>
  schedulerService?: SchedulerService
  deploymentService?: DeploymentService
  aiStorage?: AIStorageService

  content?: ContentService
  aiAgentRunner?: AIAgentRunnerService
  aiEmbedding?: AIEmbeddingService
  aiRunState?: AIRunStateService
  agentRunService?: AgentRunService
  workflowRunService?: WorkflowRunService
  credentialService?: CredentialService
  emailService?: EmailService
  /**
   * Queue-backed outgoing webhook delivery. The queue-only default throws on
   * the delivery-read methods; a store-backed implementation records history.
   */
  webhookService?: WebhookService
  metaService?: MetaService
  /** V8 precise-coverage collector (`pikku dev --coverage` only) */
  coverageService?: CoverageService
  audit?: AuditService
  /**
   * Request-scoped audit buffer that writes into `audit` (the durable sink).
   * Returned as a wire service so the runner flushes it via `close()` when the
   * invocation ends.
   */
  auditLog?: AuditLog
  /** Session store for persisting user sessions keyed by pikkuUserId */
  sessionStore?: SessionStore
  /**
   * Resolves and administers user scopes. Called when building a session,
   * never by the function runner.
   */
  scopeService?: ScopeService
  /**
   * Built once by the factory an auth package registers and injected by the
   * generated `pikkuServices` wrapper — service factories must not return it
   * themselves. Absent when the project wires no auth.
   */
  auth?: () => Promise<AuthInstance>
}

export type PikkuWire<
  In = unknown,
  Out = unknown,
  HasInitialSession extends boolean = false,
  UserSession extends CoreUserSession = CoreUserSession,
  TypedRPC extends PikkuRPC = PikkuRPC,
  IsChannel extends true | null = null,
  MCPTools extends string | never = never,
  TypedWorkflow extends PikkuWorkflowWire | never = PikkuWorkflowWire,
  TriggerOutput = unknown,
  TypedScenario extends PikkuScenarioWire | never = PikkuScenarioWire,
  TypedActors extends ScenarioPersonas = ScenarioPersonas,
> = {
  /** Always present — lazily initialised on first access for every function invocation */
  rpc: TypedRPC
} & Partial<{
  wireType: PikkuWiringTypes
  wireId: string
  /** Trace ID for distributed tracing — propagated across remote RPC calls via x-trace-id header */
  traceId: string
  functionId: string
  addonNamespace: string
  http: PikkuHTTP<In>
  mcp: PikkuMCP<MCPTools>
  // `channel.remote` is typed off the same generated map as `rpc.remote`, so
  // calling back into the connected peer is checked against the app's own
  // function contracts rather than being a string and an `any`.
  channel: [IsChannel] extends [null]
    ? PikkuChannel<unknown, Out, TypedRPC['remote']>
    : PikkuChannel<unknown, Out, TypedRPC['remote']> | undefined
  scheduledTask: PikkuScheduledTask
  queue: PikkuQueue
  cli: PikkuCLI<TypedRPC['remote']>
  workflow: TypedWorkflow
  scenario: TypedScenario
  actors: TypedActors
  /** Present on every scenario step invocation */
  scenarioStep: PikkuScenarioStepWire<ScenarioPersonaOf<TypedActors>>
  /** Present only when the runner provisioned a browser for this step */
  browser: PikkuBrowserWire
  workflowStep: WorkflowStepWire
  graph: PikkuGraphWire
  trigger: PikkuTrigger<TriggerOutput>
  gateway: PikkuGateway
  session: HasInitialSession extends true
    ? UserSession
    : UserSession | undefined
  setSession: (session: UserSession) => Promise<void> | void
  clearSession: () => Promise<void> | void
  /** Fetch the latest session (may read from backing store) */
  getSession: () => Promise<UserSession> | UserSession | undefined
  hasSessionChanged: () => boolean
  pikkuUserId: string
  /** Set a credential value (available in middleware) */
  setCredential: (name: string, value: unknown) => void
  /** Get a single credential by name — lazy-loads from CredentialService on first call, sync thereafter */
  getCredential: <T = unknown>(name: string) => T | null | Promise<T | null>
  /** Get all resolved credentials — lazy-loads from CredentialService on first call, sync thereafter */
  getCredentials: () =>
    | Record<string, unknown>
    | Promise<Record<string, unknown>>
  audit: {
    durability: AuditDurability
  }
  /**
   * Declare that everything after this line changes something.
   *
   * Present only on functions that are not `readonly` — a read has nothing to
   * declare. Throws `AbandonedError` if whatever asked for this work has
   * already gone away (an interrupted agent run, a disconnected client), so the
   * mutation never runs and the abort is clean. Otherwise it marks the call as
   * mutating, so an interrupt landing after this point is reported rather than
   * silently discarded.
   *
   * Cooperative: a function that never calls it is assumed to have changed
   * something, which is the safe default.
   */
  beginChanges: () => Promise<void>
}>

/** Wire as constructed by runners, before the function runner lazily adds `rpc`. */
export type PikkuRawWire = Omit<PikkuWire, 'rpc'>

export type CorePikkuMiddleware<
  SingletonServices extends CoreSingletonServices = CoreSingletonServices,
  UserSession extends CoreUserSession = CoreUserSession,
> = (
  services: SingletonServices,
  wires: PikkuWire,
  next: () => Promise<void>
) => Promise<void>

/**
 * Execution order: `highest` runs first (outermost in the onion), `lowest`
 * runs last, closest to the function.
 */
export type MiddlewarePriority =
  | 'highest'
  | 'high'
  | 'medium'
  | 'low'
  | 'lowest'

export type CorePikkuMiddlewareConfig<
  SingletonServices extends CoreSingletonServices = CoreSingletonServices,
  UserSession extends CoreUserSession = CoreUserSession,
> = {
  func: CorePikkuMiddleware<SingletonServices, UserSession>
  name?: string
  description?: string
  /** Execution priority. Lower runs first (outermost). Defaults to 'medium'. */
  priority?: MiddlewarePriority
}

export type CorePikkuMiddlewareFactory<
  In = any,
  SingletonServices extends CoreSingletonServices = CoreSingletonServices,
  UserSession extends CoreUserSession = CoreUserSession,
> = (input: In) => CorePikkuMiddleware<SingletonServices, UserSession>

export type CorePikkuMiddlewareGroup<
  SingletonServices extends CoreSingletonServices = CoreSingletonServices,
  UserSession extends CoreUserSession = CoreUserSession,
> = Array<
  | CorePikkuMiddleware<SingletonServices, UserSession>
  | CorePikkuMiddlewareFactory<any, SingletonServices, UserSession>
>

export const pikkuMiddleware = <
  SingletonServices extends CoreSingletonServices = CoreSingletonServices,
  UserSession extends CoreUserSession = CoreUserSession,
>(
  middleware:
    | CorePikkuMiddleware<SingletonServices, UserSession>
    | CorePikkuMiddlewareConfig<SingletonServices, UserSession>
): CorePikkuMiddleware<SingletonServices, UserSession> => {
  if (typeof middleware === 'function') return middleware
  const func = middleware.func as CorePikkuMiddleware<
    SingletonServices,
    UserSession
  > & { __priority?: MiddlewarePriority }
  if (middleware.priority) {
    func.__priority = middleware.priority
  }
  return func
}

export const pikkuMiddlewareFactory = <In = any>(
  factory: CorePikkuMiddlewareFactory<In>
): CorePikkuMiddlewareFactory<In> => {
  return factory
}

export const pikkuChannelMiddleware = <
  SingletonServices extends CoreSingletonServices = CoreSingletonServices,
  Event = unknown,
>(
  middleware: CorePikkuChannelMiddleware<SingletonServices, Event>
): CorePikkuChannelMiddleware<SingletonServices, Event> => {
  return middleware
}

export const pikkuChannelMiddlewareFactory = <In = any>(
  factory: CorePikkuChannelMiddlewareFactory<In>
): CorePikkuChannelMiddlewareFactory<In> => {
  return factory
}

export type { PikkuAIMiddlewareHooks } from '../wirings/ai-agent/ai-agent.types.js'

export const pikkuAIMiddleware = <
  State extends Record<string, unknown> = Record<string, unknown>,
  SingletonServices extends CoreSingletonServices = CoreSingletonServices,
>(
  hooks: PikkuAIMiddlewareHooks<State, SingletonServices>
): PikkuAIMiddlewareHooks<State, SingletonServices> => hooks

export type CoreServices<SingletonServices = CoreSingletonServices> =
  SingletonServices

export type WireServices<
  SingletonServices extends CoreSingletonServices = CoreSingletonServices,
  Services = CoreServices<SingletonServices>,
> = Omit<Services, keyof SingletonServices | 'session'>

export type CreateSingletonServices<
  Config extends CoreConfig,
  SingletonServices extends CoreSingletonServices,
> = (
  config: Config,
  existingServices?: Partial<SingletonServices>
) => Promise<SingletonServices>

export type CreateWireServices<
  SingletonServices extends CoreSingletonServices = CoreSingletonServices,
  Services extends CoreServices<SingletonServices> =
    CoreServices<SingletonServices>,
  UserSession extends CoreUserSession = CoreUserSession,
> = (
  services: SingletonServices,
  wire: PikkuRawWire
) => Promise<WireServices<Services, SingletonServices>>

export type CreateConfig<
  Config extends CoreConfig,
  RemainingArgs extends any[] = unknown[],
> = (variables?: VariablesService, ...args: RemainingArgs) => Promise<Config>

export type ServerLifecycle<
  SingletonServices extends CoreSingletonServices = CoreSingletonServices,
> = {
  beforeStart?: (services: SingletonServices) => void | Promise<void>
  afterStart?: (services: SingletonServices) => void | Promise<void>
  beforeStop?: (services: SingletonServices) => void | Promise<void>
  afterStop?: (services: SingletonServices) => void | Promise<void>
}

export type CommonWireMeta = {
  pikkuFuncId: string
  packageName?: string

  title?: string
  tags?: string[]
  summary?: string
  description?: string
  errors?: string[]

  middleware?: MiddlewareMetadata[]
  permissions?: PermissionMetadata[]
}

/**
 * The shape of `.pikku/audit.json`. Shared by the CLI (writer), the console
 * addon (reader) and the console UI (renderer).
 */
export type SecuritySeverity = 'critical' | 'high' | 'moderate' | 'low' | 'info'
export type SecurityUpdateLevel = 'major' | 'minor' | 'patch' | 'unknown'

export interface SecurityAuditIssue {
  package: string
  severity: SecuritySeverity
  title: string
  advisoryId: string
  url: string
  vulnerableVersions: string
  cwe: string[]
  cvssScore: number | null
  recommendedVersion: string | null
}

export interface SecurityAuditUpdate {
  package: string
  current: string
  latest: string
  level: SecurityUpdateLevel
}

export interface SecurityAuditSummary {
  totalIssues: number
  critical: number
  high: number
  moderate: number
  low: number
  totalUpdates: number
  major: number
  minor: number
  patch: number
}

export interface SecurityAuditReport {
  schemaVersion: number
  tool: string
  generatedAt: string
  note?: string
  issues: SecurityAuditIssue[]
  updates: SecurityAuditUpdate[]
  summary: SecurityAuditSummary
}

export interface SerializedError {
  message: string
  stack?: string
  code?: string
  // Set for a deliberate PikkuError; survives step-boundary rehydration so
  // the workflow runner logs the message alone rather than a stack trace.
  expected?: boolean
  [key: string]: any
}

/**
 * A generated schema's declaration site, used by the credential/secret/variable
 * definition validators to point conflicting definitions at their source.
 */
export interface SchemaRefLike {
  variableName: string
  sourceFile: string
}
