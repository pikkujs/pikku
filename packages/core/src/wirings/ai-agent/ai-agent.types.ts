import {
  CorePermissionGroup,
  CorePikkuFunctionConfig,
  CorePikkuFunctionSessionless,
  CorePikkuPermission,
} from '../../function/functions.types.js'
import {
  CorePikkuMiddleware,
  MiddlewareMetadata,
  PermissionMetadata,
} from '../../types/core.types.js'

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
  text: string
  threadId: string
  steps: AIAgentStep[]
  usage: { inputTokens: number; outputTokens: number }
}

export interface AIAgentModelConfig {
  provider: string
  model: string
  [key: string]: unknown
}

export interface AIAgentToolDef {
  name: string
  description: string
  inputSchema: Record<string, unknown>
  execute: (input: unknown) => Promise<unknown>
}

export type AIAgentMemoryConfig = {
  storage?: string
  vector?: string
  embedder?: string
  lastMessages?: number
  workingMemory?: boolean
  semanticRecall?: { topK?: number } | false
}

export type CoreAIAgent<
  PikkuFunctionConfig = CorePikkuFunctionConfig<
    CorePikkuFunctionSessionless<any, any>
  >,
  PikkuPermission = CorePikkuPermission<any, any>,
  PikkuMiddleware = CorePikkuMiddleware<any>,
> = {
  name: string
  description: string
  summary?: string
  errors?: string[]
  instructions: string | string[]
  model: AIAgentModelConfig
  tools?: string[]
  memory?: AIAgentMemoryConfig
  maxSteps?: number
  toolChoice?: 'auto' | 'required' | 'none'
  func?: PikkuFunctionConfig
  tags?: string[]
  middleware?: PikkuMiddleware[]
  permissions?: CorePermissionGroup<PikkuPermission>
}

export type AIAgentMeta = Record<
  string,
  Omit<CoreAIAgent, 'func' | 'middleware' | 'permissions'> & {
    pikkuFuncId?: string
    inputSchema: string | null
    outputSchema: string | null
    middleware?: MiddlewareMetadata[]
    permissions?: PermissionMetadata[]
  }
>
