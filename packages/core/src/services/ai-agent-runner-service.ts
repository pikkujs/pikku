import type {
  AIMessage,
  AIAgentStep,
  AIAgentToolDef,
  AIStreamChannel,
} from '../wirings/ai-agent/ai-agent.types.js'

export type AIAgentRunnerParams = {
  model: string
  temperature?: number
  instructions: string
  messages: AIMessage[]
  tools: AIAgentToolDef[]
  maxSteps: number
  toolChoice: 'auto' | 'required' | 'none'
  outputSchema?: Record<string, unknown>
}

export type AIAgentRunnerResult = {
  text: string
  object?: unknown
  steps: AIAgentStep[]
  usage: { inputTokens: number; outputTokens: number }
}

export type AIAgentStepResult = {
  text: string
  object?: unknown
  toolCalls: { toolCallId: string; toolName: string; args: unknown }[]
  toolResults: { toolCallId: string; toolName: string; result: unknown }[]
  usage: { inputTokens: number; outputTokens: number }
  finishReason: 'stop' | 'tool-calls' | 'length' | 'error' | 'unknown'
}

export interface AIAgentRunnerService {
  stream(
    params: AIAgentRunnerParams,
    channel: AIStreamChannel
  ): Promise<AIAgentStepResult>
  run(params: AIAgentRunnerParams): Promise<AIAgentStepResult>
}
