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
    onStepFinish?: (step: AIAgentStep) => void
  }): Promise<{
    text: string
    steps: AIAgentStep[]
    usage: { inputTokens: number; outputTokens: number }
  }>
}
