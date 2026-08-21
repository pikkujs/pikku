import type { Logger, LogLevel } from '../services/logger.js'
import type { VariablesService } from '../services/variables-service.js'
import type { SecretService } from '../services/secret-service.js'
import type { SchemaService } from '../services/schema-service.js'
import type { JWTService } from '../services/jwt-service.js'
import type { PikkuHTTP } from '../wirings/http/http.types.js'
import type { PikkuChannel } from '../wirings/channel/channel.types.js'
import type { EventHubService } from '../wirings/channel/eventhub-service.js'
import type { PikkuRPC } from '../wirings/rpc/rpc-types.js'
import type { PikkuMCP } from '../wirings/mcp/mcp.types.js'
import type { PikkuScheduledTask } from '../wirings/scheduler/scheduler.types.js'
import type { PikkuQueue, QueueService } from '../wirings/queue/queue.types.js'
import type { PikkuCLI } from '../wirings/cli/cli.types.js'
import type {
  PikkuWorkflowWire,
  WorkflowService,
  WorkflowServiceConfig,
  WorkflowStepWire,
} from '../wirings/workflow/workflow.types.js'
import type { PikkuScenarioWire } from '../wirings/workflow/scenario.types.js'
import type {
  PikkuBrowserWire,
  PikkuScenarioStepWire,
} from '../wirings/workflow/scenario-step.types.js'
import type { PikkuGraphWire } from '../wirings/workflow/graph/workflow-graph.types.js'
import type { PikkuTrigger } from '../wirings/trigger/trigger.types.js'
import type { PikkuGateway } from '../wirings/gateway/gateway.types.js'
import type { SchedulerService } from '../services/scheduler-service.js'
import type { DeploymentService } from '../services/deployment-service.js'
import type { AgentStorageService } from '../services/agent-storage-service.js'

import type { ContentService } from '../services/content-service.js'
import type {
  ScenarioPersonaOf,
  ScenarioPersonas,
} from '../services/personas-service.js'
import type { AgentRunnerService } from '../services/agent-runner-service.js'
import type { AIEmbeddingService } from '../services/ai-embedding-service.js'
import type { AgentRunStateService } from '../services/agent-run-state-service.js'
import type { AgentRunService } from '../wirings/agent/agent.types.js'
import type { MiddlewareMetadata } from '../middleware/middleware.types.js'
import type { PermissionMetadata } from '../function/function-meta.types.js'
import type { VirtualUserRunStore } from '../wirings/virtual-user/virtual-user-run-store.js'
import type { VirtualUserScheduleStore } from '../wirings/virtual-user/virtual-user-schedule-store.js'
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
  secrets?: {
    /** Refuse a secret that declares no `allowedHosts` rather than treating it as unrestricted. */
    requireAllowedHosts?: boolean
  }

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
  /**
   * Restricts the session to functions declared `readonly`. The function runner
   * throws `ReadonlySessionError` for anything else.
   */
  readonly?: boolean
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
  agentStorage?: AgentStorageService

  content?: ContentService
  agentRunner?: AgentRunnerService
  aiEmbedding?: AIEmbeddingService
  agentRunState?: AgentRunStateService
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
  /**
   * Where virtual-user runs are recorded. A run is dispatched and answered for
   * later, so this store is the only trace it leaves — see
   * {@link VirtualUserRunStore}.
   */
  virtualUserRunStore?: VirtualUserRunStore
  /**
   * Each persona's cadence, for apps that want their virtual users to keep
   * going without being asked. Separate from the run store on purpose: wiring
   * nothing is how an app says it only wants the runs it starts itself.
   */
  virtualUserScheduleStore?: VirtualUserScheduleStore
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

/**
 * Reads a single credential. The first signature resolves the value type from
 * the project's generated `CredentialsMap`; the second keeps a name the map
 * does not know callable with an explicit type.
 *
 * `TCredentials` is unconstrained because the generated map is an interface,
 * which has no implicit index signature and so cannot satisfy
 * `Record<string, unknown>`.
 */
export type GetCredential<TCredentials = Record<string, unknown>> = {
  <K extends keyof TCredentials & string>(
    name: K
  ): TCredentials[K] | null | Promise<TCredentials[K] | null>
  <T = unknown>(name: string): T | null | Promise<T | null>
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
  // `any`, not `Out`: the emitted `TypedScenario<Out>` supplies the real
  // context, and this default is what other generics constrain against. See
  // `ScenarioContext`.
  TypedScenario extends PikkuScenarioWire<any> | never = PikkuScenarioWire<any>,
  TypedActors extends ScenarioPersonas = ScenarioPersonas,
  TypedCredentials = Record<string, unknown>,
> = {
  /** Always present — lazily initialised on first access for every function invocation */
  rpc: TypedRPC
} & Partial<{
  wireType: PikkuWiringTypes
  wireId: string
  /**
   * A logger scoped to this invocation, when a host attaches one. Core never
   * sets it; services that log fall back to the singleton logger.
   */
  logger: Logger
  /** Trace ID for distributed tracing — propagated across remote RPC calls via the x-request-id header */
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
  /**
   * The persona this step runs as, injected by the runner.
   *
   * Required on a `browser` binding, which cannot be provisioned without one,
   * and on any binding whose step declares `actor: true`. A step that declares
   * neither has no `actor` on its wire at all rather than an optional one —
   * a pure assertion has nobody to be, and `attemptsSignIn` deliberately posts
   * credentials instead of reusing an actor's session.
   */
  actor: ScenarioPersonaOf<TypedActors>
  /** Present on every scenario step invocation */
  scenarioStep: PikkuScenarioStepWire
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
  getCredential: GetCredential<TypedCredentials>
  /** Get all resolved credentials — lazy-loads from CredentialService on first call, sync thereafter */
  getCredentials: () =>
    Record<string, unknown> | Promise<Record<string, unknown>>
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

export type CoreServices<SingletonServices = CoreSingletonServices> =
  SingletonServices

/** Strips `secrets` from a services type. */
export type SecretlessServices<Services> = Omit<Services, 'secrets'>

/** The constraint every function-, permission- and auth-facing type is bounded by. */
export type CoreSecretlessSingletonServices<
  Config extends CoreConfig = CoreConfig,
> = SecretlessServices<CoreSingletonServices<Config>>

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

/**
 * A generated schema's declaration site, used by the credential/secret/variable
 * definition validators to point conflicting definitions at their source.
 */
export interface SchemaRefLike {
  variableName: string
  sourceFile: string
}
