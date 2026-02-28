import type {
  CorePermissionGroup,
  CorePikkuPermission,
} from '../../function/functions.types.js'
import type {
  CorePikkuMiddleware,
  MiddlewareMetadata,
  PermissionMetadata,
} from '../../types/core.types.js'
import type { PikkuChannel } from '../channel/channel.types.js'
import type { CorePikkuChannelMiddleware } from '../channel/channel.types.js'

export interface AIThread {
  id: string
  resourceId: string
  title?: string
  metadata?: Record<string, unknown>
  createdAt: Date
  updatedAt: Date
}

export interface AIToolCall {
  id: string
  name: string
  args: Record<string, unknown>
}

export interface AIToolResult {
  id: string
  name: string
  result: string
}

export interface AIMessage {
  id: string
  role: 'system' | 'user' | 'assistant' | 'tool'
  content?: string
  toolCalls?: AIToolCall[]
  toolResults?: AIToolResult[]
  createdAt: Date
}

export interface AIAgentStep {
  usage: { inputTokens: number; outputTokens: number }
  toolCalls?: { name: string; args: Record<string, unknown>; result: string }[]
}

export interface AIAgentInput {
  message: string
  threadId: string
  resourceId: string
}

export interface AIAgentOutput {
  runId: string
  text: string
  object?: unknown
  threadId: string
  steps: AIAgentStep[]
  usage: { inputTokens: number; outputTokens: number }
}

export interface AIAgentToolDef {
  name: string
  description: string
  inputSchema: Record<string, unknown>
  execute: (input: unknown) => Promise<unknown>
  needsApproval?: boolean
}

export interface PikkuAIMiddlewareHooks<
  State extends Record<string, unknown> = Record<string, unknown>,
  Services = any,
> {
  modifyInput?: (
    services: Services,
    ctx: { messages: AIMessage[]; instructions: string }
  ) =>
    | Promise<{ messages: AIMessage[]; instructions: string }>
    | { messages: AIMessage[]; instructions: string }

  modifyOutputStream?: (
    services: Services,
    ctx: {
      event: AIStreamEvent
      allEvents: readonly AIStreamEvent[]
      state: State
    }
  ) => Promise<AIStreamEvent | null> | AIStreamEvent | null

  modifyOutput?: (
    services: Services,
    ctx: {
      text: string
      messages: AIMessage[]
      usage: { inputTokens: number; outputTokens: number }
    }
  ) =>
    | Promise<{ text: string; messages: AIMessage[] }>
    | { text: string; messages: AIMessage[] }

  beforeToolCall?: (
    services: Services,
    ctx: {
      toolName: string
      toolCallId: string
      args: Record<string, unknown>
    }
  ) =>
    | Promise<{ args: Record<string, unknown> } | void>
    | { args: Record<string, unknown> }
    | void

  afterToolCall?: (
    services: Services,
    ctx: {
      toolName: string
      toolCallId: string
      args: Record<string, unknown>
      result: unknown
      durationMs: number
    }
  ) => Promise<{ result: unknown } | void> | { result: unknown } | void

  afterStep?: (
    services: Services,
    ctx: {
      stepNumber: number
      text: string
      toolCalls: { toolCallId: string; toolName: string; args: unknown }[]
      toolResults: { toolCallId: string; toolName: string; result: unknown }[]
      usage: { inputTokens: number; outputTokens: number }
      finishReason: string
    }
  ) => Promise<void> | void

  onError?: (
    services: Services,
    ctx: {
      error: Error
      stepNumber: number
      messages: AIMessage[]
    }
  ) => Promise<void> | void
}

export type AIAgentMemoryConfig = {
  storage?: string
  vector?: string
  embedder?: string
  lastMessages?: number
  workingMemory?: unknown
}

export type CoreAIAgent<
  PikkuPermission = CorePikkuPermission<any, any>,
  PikkuMiddleware = CorePikkuMiddleware<any>,
> = {
  name: string
  description: string
  summary?: string
  errors?: string[]
  instructions: string | string[]
  model: string
  temperature?: number
  tools?: unknown[]
  agents?: unknown[]
  memory?: AIAgentMemoryConfig
  maxSteps?: number
  toolChoice?: 'auto' | 'required' | 'none'
  input?: unknown
  output?: unknown
  tags?: string[]
  protocol?: 'ui-message-stream'
  prepareStep?: (ctx: {
    stepNumber: number
    messages: AIMessage[]
    tools: AIAgentToolDef[]
    toolChoice: 'auto' | 'required' | 'none'
    model: string
    stop: () => void
  }) => void | Promise<void>
  middleware?: PikkuMiddleware[]
  channelMiddleware?: CorePikkuChannelMiddleware<any, any>[]
  aiMiddleware?: PikkuAIMiddlewareHooks<any, any>[]
  permissions?: CorePermissionGroup<PikkuPermission>
}

export type AIStreamEvent =
  | { type: 'step-start'; stepNumber: number; agent?: string; session?: string }
  | { type: 'text-delta'; text: string; agent?: string; session?: string }
  | { type: 'reasoning-delta'; text: string; agent?: string; session?: string }
  | {
      type: 'tool-call'
      toolCallId: string
      toolName: string
      args: unknown
      agent?: string
      session?: string
    }
  | {
      type: 'tool-result'
      toolCallId: string
      toolName: string
      result: unknown
      agent?: string
      session?: string
    }
  | {
      type: 'agent-call'
      agentName: string
      session: string
      input: unknown
    }
  | {
      type: 'agent-result'
      agentName: string
      session: string
      result: unknown
    }
  | {
      type: 'approval-request'
      toolCallId: string
      toolName: string
      args: unknown
      reason?: string
      agent?: string
      session?: string
    }
  | {
      type: 'usage'
      tokens: { input: number; output: number }
      model: string
      agent?: string
      session?: string
    }
  | { type: 'error'; message: string; agent?: string; session?: string }
  | {
      type: 'suspended'
      reason: 'rpc-missing'
      missingRpcs: string[]
    }
  | { type: 'done' }

export interface AIStreamChannel extends PikkuChannel<unknown, AIStreamEvent> {}

export type PendingApproval =
  | {
      type: 'tool-call'
      toolCallId: string
      toolName: string
      args: unknown
    }
  | {
      type: 'agent-call'
      toolCallId: string
      agentName: string
      agentRunId: string
      displayToolName: string
      displayArgs: unknown
    }

export interface AgentRunState {
  runId: string
  agentName: string
  threadId: string
  resourceId: string
  status: 'running' | 'suspended' | 'completed' | 'failed'
  suspendReason?: 'approval' | 'rpc-missing'
  missingRpcs?: string[]
  pendingApprovals?: PendingApproval[]
  usage: { inputTokens: number; outputTokens: number; model: string }
  createdAt: Date
  updatedAt: Date
}

export interface AgentRunRow {
  runId: string
  agentName: string
  threadId: string
  resourceId: string
  status: string
  suspendReason?: string
  missingRpcs?: string[]
  usageInputTokens: number
  usageOutputTokens: number
  usageModel: string
  createdAt: Date
  updatedAt: Date
}

export interface AgentRunService {
  listThreads(options?: {
    agentName?: string
    limit?: number
    offset?: number
  }): Promise<AIThread[]>
  getThread(threadId: string): Promise<AIThread | null>
  getThreadMessages(threadId: string): Promise<AIMessage[]>
  getThreadRuns(threadId: string): Promise<AgentRunRow[]>
  deleteThread(threadId: string): Promise<boolean>
  getDistinctAgentNames(): Promise<string[]>
}

export type AIAgentMeta = Record<
  string,
  Omit<
    CoreAIAgent,
    | 'input'
    | 'output'
    | 'tools'
    | 'agents'
    | 'middleware'
    | 'channelMiddleware'
    | 'aiMiddleware'
    | 'permissions'
  > & {
    tools?: string[]
    agents?: string[]
    inputSchema: string | null
    outputSchema: string | null
    workingMemorySchema: string | null
    middleware?: MiddlewareMetadata[]
    channelMiddleware?: MiddlewareMetadata[]
    aiMiddleware?: MiddlewareMetadata[]
    permissions?: PermissionMetadata[]
  }
>
