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
  /** Pikku agent function name — forwarded to the LLM proxy (LiteLLM) as
   *  request-level metadata so usage can be broken down per agent. */
  agentId?: string
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
  reasoningContent?: string
}

export interface AIAgentRunnerService {
  stream(
    params: AIAgentRunnerParams,
    channel: AIStreamChannel
  ): Promise<AIAgentStepResult>
  run(params: AIAgentRunnerParams): Promise<AIAgentStepResult>
  /** Return a new runner that uses the given API key for every LLM call.
   *  Optional — runners that don't support per-key scoping leave this undefined. */
  withApiKey?(apiKey: string): AIAgentRunnerService
}
