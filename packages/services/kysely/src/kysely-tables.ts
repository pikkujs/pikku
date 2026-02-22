import type { Generated } from 'kysely'

export interface ChannelsTable {
  channel_id: string
  channel_name: string
  created_at: Generated<Date>
  opening_data: string
  user_session: string | null
  last_wire: Generated<Date>
}

export interface ChannelSubscriptionsTable {
  channel_id: string
  topic: string
}

export interface WorkflowRunsTable {
  workflow_run_id: Generated<string>
  workflow: string
  status: string
  input: string
  output: string | null
  error: string | null
  state: Generated<string>
  inline: Generated<boolean>
  graph_hash: string | null
  created_at: Generated<Date>
  updated_at: Generated<Date>
}

export interface WorkflowStepTable {
  workflow_step_id: Generated<string>
  workflow_run_id: string
  step_name: string
  rpc_name: string | null
  data: string | null
  status: Generated<string>
  result: string | null
  error: string | null
  branch_taken: string | null
  retries: number | null
  retry_delay: string | null
  created_at: Generated<Date>
  updated_at: Generated<Date>
}

export interface WorkflowStepHistoryTable {
  history_id: Generated<string>
  workflow_step_id: string
  status: string
  result: string | null
  error: string | null
  created_at: Generated<Date>
  running_at: Date | null
  scheduled_at: Date | null
  succeeded_at: Date | null
  failed_at: Date | null
}

export interface WorkflowVersionsTable {
  workflow_name: string
  graph_hash: string
  graph: string
  source: string
  created_at: Generated<Date>
}

export interface AIThreadsTable {
  id: string
  resource_id: string
  title: string | null
  metadata: string | null
  created_at: Generated<Date>
  updated_at: Generated<Date>
}

export interface AIMessageTable {
  id: string
  thread_id: string
  role: string
  content: string | null
  created_at: Generated<Date>
}

export interface AIToolCallTable {
  id: string
  thread_id: string
  message_id: string
  run_id: string | null
  tool_name: string
  args: string
  result: string | null
  approval_status: string | null
  created_at: Generated<Date>
}

export interface AIWorkingMemoryTable {
  id: string
  scope: string
  data: string
  updated_at: Generated<Date>
}

export interface AIRunTable {
  run_id: Generated<string>
  agent_name: string
  thread_id: string
  resource_id: string
  status: Generated<string>
  suspend_reason: string | null
  missing_rpcs: string | null
  usage_input_tokens: Generated<number>
  usage_output_tokens: Generated<number>
  usage_model: Generated<string>
  created_at: Generated<Date>
  updated_at: Generated<Date>
}

export interface PikkuDeploymentsTable {
  deployment_id: string
  endpoint: string
  last_heartbeat: Generated<Date>
  created_at: Generated<Date>
}

export interface PikkuDeploymentFunctionsTable {
  deployment_id: string
  function_name: string
}

export interface KyselyPikkuDB {
  channels: ChannelsTable
  channel_subscriptions: ChannelSubscriptionsTable
  workflow_runs: WorkflowRunsTable
  workflow_step: WorkflowStepTable
  workflow_step_history: WorkflowStepHistoryTable
  workflow_versions: WorkflowVersionsTable
  ai_threads: AIThreadsTable
  ai_message: AIMessageTable
  ai_tool_call: AIToolCallTable
  ai_working_memory: AIWorkingMemoryTable
  ai_run: AIRunTable
  pikku_deployments: PikkuDeploymentsTable
  pikku_deployment_functions: PikkuDeploymentFunctionsTable
}
