import {
  CorePermissionGroup,
  CorePikkuPermission,
} from '../../function/functions.types.js'
import {
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
}

export interface PikkuAIMiddlewareHooks<Services = any, Event = any> {
  modifyInput?: (
    services: Services,
    ctx: { messages: AIMessage[]; instructions: string }
  ) =>
    | Promise<{ messages: AIMessage[]; instructions: string }>
    | { messages: AIMessage[]; instructions: string }

  modifyOutputStream?: (
    services: Services,
    ctx: {
      event: Event
      allEvents: readonly Event[]
      state: Record<string, unknown>
    }
  ) => Promise<Event | null> | Event | null

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
  tools?: unknown[]
  agents?: unknown[]
  memory?: AIAgentMemoryConfig
  maxSteps?: number
  toolChoice?: 'auto' | 'required' | 'none'
  input?: unknown
  output?: unknown
  tags?: string[]
  middleware?: PikkuMiddleware[]
  channelMiddleware?: CorePikkuChannelMiddleware<any, any>[]
  aiMiddleware?: PikkuAIMiddlewareHooks[]
  permissions?: CorePermissionGroup<PikkuPermission>
}

export type AIStreamEvent =
  | { type: 'text-delta'; text: string; agent?: string; session?: string }
  | { type: 'reasoning-delta'; text: string; agent?: string; session?: string }
  | {
      type: 'tool-call'
      toolName: string
      args: unknown
      agent?: string
      session?: string
    }
  | {
      type: 'tool-result'
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
      id: string
      toolName: string
      args: unknown
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

export interface AgentRunState {
  runId: string
  agentName: string
  threadId: string
  resourceId: string
  status: 'running' | 'suspended' | 'completed' | 'failed'
  suspendReason?: 'approval' | 'rpc-missing'
  missingRpcs?: string[]
  pendingApprovals?: {
    toolCallId: string
    toolName: string
    args: unknown
  }[]
  usage: { inputTokens: number; outputTokens: number; model: string }
  createdAt: Date
  updatedAt: Date
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
