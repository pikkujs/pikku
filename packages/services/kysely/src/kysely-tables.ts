import type { Generated } from 'kysely'
import type {
  WorkflowStatus,
  StepStatus,
  WorkflowVersionStatus,
} from '@pikku/core/workflow'

export interface ChannelsTable {
  channelId: string
  channelName: string
  createdAt: Generated<Date>
  openingData: string
  pikkuUserId: string | null
  /** JSON-serialized per-socket channel state, keyed by channelId. */
  state: string | null
  lastWire: Generated<Date>
}

export interface ChannelSubscriptionsTable {
  channelId: string
  topic: string
}

export interface WorkflowRunsTable {
  workflowRunId: Generated<string>
  workflow: string
  status: WorkflowStatus
  input: string
  output: string | null
  error: string | null
  state: Generated<string>
  inline: Generated<boolean>
  graphHash: string | null
  deterministic: Generated<boolean>
  plannedSteps: string | null
  wire: string | null
  createdAt: Generated<Date>
  updatedAt: Generated<Date>
}

export interface WorkflowStepTable {
  workflowStepId: Generated<string>
  workflowRunId: string
  stepName: string
  rpcName: string | null
  data: string | null
  status: Generated<StepStatus>
  result: string | null
  error: string | null
  childRunId: string | null
  branchTaken: string | null
  retries: number | null
  retryDelay: string | null
  fromStepName: string | null
  /** The history attempt currently in flight; see WorkflowStepHistoryTable.attempt. */
  currentAttempt: number | null
  createdAt: Generated<Date>
  updatedAt: Generated<Date>
}

export interface WorkflowStepHistoryTable {
  historyId: Generated<string>
  workflowStepId: string
  status: StepStatus
  result: string | null
  error: string | null
  /**
   * Monotonic attempt number within the step, starting at 1. Orders attempts
   * and identifies the live one without relying on `createdAt`, which cannot
   * separate a retry from the attempt it replaces in the same millisecond.
   */
  attempt: number | null
  createdAt: Generated<Date>
  runningAt: Date | null
  scheduledAt: Date | null
  succeededAt: Date | null
  failedAt: Date | null
}

export interface WorkflowVersionsTable {
  workflowName: string
  graphHash: string
  graph: string
  source: string
  status: Generated<WorkflowVersionStatus>
  createdAt: Generated<Date>
}

export interface AgentThreadsTable {
  id: string
  resourceId: string
  title: string | null
  metadata: string | null
  createdAt: Generated<Date>
  updatedAt: Generated<Date>
}

export interface AgentMessageTable {
  id: string
  threadId: string
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string | null
  createdAt: Generated<Date>
}

export interface AgentToolCallTable {
  id: string
  threadId: string
  messageId: string
  runId: string | null
  toolName: string
  args: string
  result: string | null
  approvalStatus: 'approved' | 'denied' | 'pending' | null
  approvalType: 'agent-call' | 'tool-call' | null
  agentRunId: string | null
  displayToolName: string | null
  displayArgs: string | null
  createdAt: Generated<Date>
}

export interface AgentWorkingMemoryTable {
  id: string
  scope: string
  data: string
  updatedAt: Generated<Date>
}

export interface AgentRunTable {
  runId: Generated<string>
  agentName: string
  threadId: string
  resourceId: string
  /**
   * `interrupted` is distinct from `failed`: the run was stopped on purpose,
   * usually because the user talked over it. Nothing went wrong, so it should
   * not show up in error reporting.
   */
  status: Generated<
    'running' | 'suspended' | 'completed' | 'failed' | 'interrupted'
  >
  errorMessage: string | null
  suspendReason: 'approval' | 'credential' | 'rpc-missing' | null
  missingRpcs: string | null
  /** JSON-serialized approvals the run is suspended on. */
  pendingApprovals: string | null
  usageInputTokens: Generated<number>
  usageOutputTokens: Generated<number>
  usageModel: Generated<string>
  createdAt: Generated<Date>
  updatedAt: Generated<Date>
}

export interface AgentRunScoreTable {
  id: string
  runId: string
  scorerName: string
  /** 0..1, so grades are comparable across scorers. */
  score: number
  reason: string | null
  /** JSON-serialized structured detail the scorer returned alongside the score. */
  metadata: string | null
  createdAt: Generated<Date>
}

export interface PikkuDeploymentsTable {
  deploymentId: string
  endpoint: string
  lastHeartbeat: Generated<Date>
  createdAt: Generated<Date>
}

export interface PikkuDeploymentFunctionsTable {
  deploymentId: string
  functionName: string
}

export interface SecretsTable {
  key: string
  ciphertext: string
  wrappedDek: string
  keyVersion: number
  createdAt: Generated<Date>
  updatedAt: Generated<Date>
}

export interface KekSaltsTable {
  keyVersion: number
  salt: string
  createdAt: Generated<Date>
}

export interface SecretsAuditTable {
  id: string
  secretKey: string
  action: string
  performedAt: Generated<Date>
}

export interface CredentialsTable {
  name: string
  userId: string | null
  ciphertext: string
  wrappedDek: string
  keyVersion: number
  createdAt: Generated<Date>
  updatedAt: Generated<Date>
}

export interface CredentialsAuditTable {
  id: string
  credentialName: string
  userId: string | null
  action: string
  performedAt: Generated<Date>
}

export interface UserSessionsTable {
  pikkuUserId: string
  session: string
  createdAt: Generated<Date>
  updatedAt: Generated<Date>
}

/**
 * The declared scope set, synced from generated SCOPES.
 *
 * Additive: a scope removed from code leaves an inert row rather than
 * cascading a grant away mid-deploy. `pikku scopes prune` removes them
 * deliberately.
 */
export interface PikkuScopesTable {
  name: string
  description: string | null
  /**
   * False once a scope is no longer declared in code. Marking is
   * non-destructive — grants survive until `pikku scopes prune` removes them
   * deliberately.
   */
  declared: Generated<boolean>
}

/** A role: a bag of scopes, composed by an admin or declared in code. */
export interface PikkuRolesTable {
  name: string
  description: string | null
  /** Declared with `defineSystemRole`, and therefore not editable here. */
  system: Generated<boolean>
  /** False for a system role whose declaration has gone: held, but inert. */
  declared: Generated<boolean>
  createdAt: Generated<Date>
}

export interface PikkuRoleScopesTable {
  role: string
  scope: string
}

export interface PikkuUserRoleTable {
  userId: string
  role: string
  grantedBy: string | null
  grantedAt: Generated<Date>
}

/** A scope granted directly to a user, outside of any role. */
export interface PikkuUserScopeTable {
  userId: string
  scope: string
  grantedBy: string | null
  grantedAt: Generated<Date>
}

export interface WebhookDeliveryTable {
  deliveryId: string
  organizationId: string | null
  url: string
  event: string | null
  status: Generated<'pending' | 'delivered' | 'failed'>
  attempts: Generated<number>
  createdAt: Generated<Date>
  updatedAt: Generated<Date>
  deliveredAt: Date | null
}

export interface WebhookDeliveryAttemptTable {
  attemptId: string
  deliveryId: string
  attemptNumber: number
  statusCode: number | null
  responseBody: string | null
  error: string | null
  createdAt: Generated<Date>
}

/**
 * One virtual-user run. The JSON columns (`goals`, `memory`, `findings`,
 * `tally`) are text the store serialises itself, so the row is byte-identical
 * on every engine.
 */
export interface VirtualUserRunTable {
  runId: string
  persona: string
  disposition: string
  /**
   * Read back as a string by some drivers — a BIGINT does not always fit a JS
   * number — so the store narrows it rather than trusting the column type.
   */
  seed: string | number | bigint
  status: Generated<'running' | 'completed' | 'failed'>
  goals: Generated<string>
  memory: Generated<string>
  findings: Generated<string>
  intents: Generated<string>
  tally: string | null
  stoppedBy: string | null
  error: string | null
  startedBy: string | null
  /**
   * Written as an ISO string and read back as whatever the driver returns — a
   * bare SQLite driver cannot bind a `Date` at all, and the store normalises
   * both ends.
   */
  createdAt: Generated<Date | string>
  finishedAt: Date | string | null
}

/**
 * One audit event. Every column is text on every engine so a locally-run
 * project and a deployed stage write rows the same reader can read; the JSON
 * columns (`tables`, `changedCols`, `event`, `old`, `data`) are serialised by
 * {@link KyselyAuditService} rather than by a plugin.
 */
export interface AuditTable {
  auditId: string
  /** ISO 8601, because string ordering is chronological ordering. */
  occurredAt: string
  type: string
  source: Generated<string>
  outcome: string | null
  functionId: string | null
  wireType: string | null
  traceId: string | null
  transactionId: string | null
  queryId: string | null
  userId: string | null
  orgId: string | null
  pikkuUserId: string | null
  tables: string | null
  changedCols: string | null
  event: string | null
  old: string | null
  data: string | null
}

/**
 * One turn of a run's transcript.
 *
 * Its own table rather than a column on {@link VirtualUserRunTable}: a run at a
 * 500-step budget carries more transcript than every other column together, and
 * the run list would pay for it on every row.
 */
export interface VirtualUserRunStepTable {
  runId: string
  /** The engine's step number. `stepIndex` because `index` is reserved in mysql. */
  stepIndex: number
  intentId: string | null
  /** JSON: the action the engine scheduled, or the `invalid` shape. */
  action: string
  status: number | null
  /** 0 or 1: not every driver in this package can bind a boolean. */
  ok: number | null
  /** JSON-encoded, so a brace-leading response is not read back as an object. */
  response: string | null
  /** JSON array, null when the turn produced no finding. */
  findingKinds: string | null
  tokensIn: Generated<number>
  tokensOut: Generated<number>
}

/**
 * One persona's cadence. Nullable timestamps and 0/1 flags for the same driver
 * reasons as {@link VirtualUserRunTable}.
 */
export interface VirtualUserScheduleTable {
  persona: string
  /** 0 or 1: not every driver in this package can bind a boolean. */
  enabled: Generated<number>
  disposition: string
  goals: Generated<string>
  /** JSON, or null for the engine's own default budget. */
  budget: string | null
  /** BIGINT, so a driver may hand either back. */
  minIntervalMs: string | number | bigint
  maxIntervalMs: string | number | bigint
  nextRunAt: Date | string
  lastRunId: string | null
  lastRunAt: Date | string | null
}

export interface KyselyPikkuDB {
  pikkuScopes: PikkuScopesTable
  pikkuRoles: PikkuRolesTable
  pikkuRoleScopes: PikkuRoleScopesTable
  pikkuUserRole: PikkuUserRoleTable
  pikkuUserScope: PikkuUserScopeTable
  channels: ChannelsTable
  channelSubscriptions: ChannelSubscriptionsTable
  workflowRuns: WorkflowRunsTable
  workflowStep: WorkflowStepTable
  workflowStepHistory: WorkflowStepHistoryTable
  workflowVersions: WorkflowVersionsTable
  agentThreads: AgentThreadsTable
  agentMessage: AgentMessageTable
  agentToolCall: AgentToolCallTable
  agentWorkingMemory: AgentWorkingMemoryTable
  agentRun: AgentRunTable
  agentRunScore: AgentRunScoreTable
  pikkuDeployments: PikkuDeploymentsTable
  pikkuDeploymentFunctions: PikkuDeploymentFunctionsTable
  secrets: SecretsTable
  secretKekSalts: KekSaltsTable
  secretsAudit: SecretsAuditTable
  credentials: CredentialsTable
  credentialKekSalts: KekSaltsTable
  credentialsAudit: CredentialsAuditTable
  pikkuUserSessions: UserSessionsTable
  webhookDelivery: WebhookDeliveryTable
  webhookDeliveryAttempt: WebhookDeliveryAttemptTable
  virtualUserRun: VirtualUserRunTable
  virtualUserRunStep: VirtualUserRunStepTable
  virtualUserSchedule: VirtualUserScheduleTable
  audit: AuditTable
}
