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

export interface AIAgentRunnerService {
  stream(params: AIAgentRunnerParams, channel: AIStreamChannel): Promise<void>
  run(params: AIAgentRunnerParams): Promise<AIAgentRunnerResult>
}
