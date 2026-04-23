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
  createdAt: Generated<Date>
  updatedAt: Generated<Date>
}

export interface WorkflowStepHistoryTable {
  historyId: Generated<string>
  workflowStepId: string
  status: StepStatus
  result: string | null
  error: string | null
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

export interface AIThreadsTable {
  id: string
  resourceId: string
  title: string | null
  metadata: string | null
  createdAt: Generated<Date>
  updatedAt: Generated<Date>
}

export interface AIMessageTable {
  id: string
  threadId: string
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string | null
  createdAt: Generated<Date>
}

export interface AIToolCallTable {
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

export interface AIWorkingMemoryTable {
  id: string
  scope: string
  data: string
  updatedAt: Generated<Date>
}

export interface AIRunTable {
  runId: Generated<string>
  agentName: string
  threadId: string
  resourceId: string
  status: Generated<'running' | 'suspended' | 'completed' | 'failed'>
  errorMessage: string | null
  suspendReason: 'approval' | 'credential' | 'rpc-missing' | null
  missingRpcs: string | null
  usageInputTokens: Generated<number>
  usageOutputTokens: Generated<number>
  usageModel: Generated<string>
  createdAt: Generated<Date>
  updatedAt: Generated<Date>
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

export interface KyselyPikkuDB {
  channels: ChannelsTable
  channelSubscriptions: ChannelSubscriptionsTable
  workflowRuns: WorkflowRunsTable
  workflowStep: WorkflowStepTable
  workflowStepHistory: WorkflowStepHistoryTable
  workflowVersions: WorkflowVersionsTable
  aiThreads: AIThreadsTable
  aiMessage: AIMessageTable
  aiToolCall: AIToolCallTable
  aiWorkingMemory: AIWorkingMemoryTable
  aiRun: AIRunTable
  pikkuDeployments: PikkuDeploymentsTable
  pikkuDeploymentFunctions: PikkuDeploymentFunctionsTable
  secrets: SecretsTable
  secretsAudit: SecretsAuditTable
  credentials: CredentialsTable
  credentialsAudit: CredentialsAuditTable
  pikkuUserSessions: UserSessionsTable
}
