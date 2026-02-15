import {
  AIMessage,
  AIAgentStep,
  AIAgentModelConfig,
  AIAgentToolDef,
} from '../wirings/ai-agent/ai-agent.types.js'

export interface AIAgentRunnerService {
  run(params: {
    model: AIAgentModelConfig
    instructions: string
    messages: AIMessage[]
    tools: AIAgentToolDef[]
    maxSteps: number
    toolChoice: 'auto' | 'required' | 'none'
    outputSchema?: Record<string, unknown>
    onStepFinish?: (step: AIAgentStep) => void
  }): Promise<{
    text: string
    object?: unknown
    steps: AIAgentStep[]
    usage: { inputTokens: number; outputTokens: number }
  }>
}
